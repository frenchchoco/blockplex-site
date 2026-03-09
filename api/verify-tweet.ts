import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

// ─── Config ──────────────────────────────────────────────────────
const TWITTER_BEARER = process.env.TWITTER_BEARER_TOKEN || '';
const OWNER_MNEMONIC = process.env.OWNER_MNEMONIC || '';
const OPNET_RPC = process.env.OPNET_RPC || 'https://testnet.opnet.org';
const NETWORK_NAME = process.env.VITE_NETWORK || 'testnet';
const IDO_ADDRESS = process.env.BLOCK_IDO_ADDRESS || '';

const MIN_ACCOUNT_AGE_DAYS = 30;
const MIN_FOLLOWERS = 10;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_S = 60;

// ─── Helpers ─────────────────────────────────────────────────────
function extractTweetId(url: string): string | null {
    // Supports: x.com/user/status/123, twitter.com/user/status/123
    const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
    return match ? match[1] : null;
}

function getClientIp(req: VercelRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    if (Array.isArray(forwarded)) return forwarded[0];
    return req.socket?.remoteAddress || 'unknown';
}

// ─── Main handler ────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ── Validate env ──
    if (!TWITTER_BEARER) return res.status(500).json({ error: 'Server misconfigured: missing X API token' });
    if (!OWNER_MNEMONIC) return res.status(500).json({ error: 'Server misconfigured: missing owner mnemonic' });
    if (!IDO_ADDRESS) return res.status(500).json({ error: 'Server misconfigured: missing IDO address' });

    // ── Parse body ──
    const { tweetUrl, walletAddress } = req.body || {};
    if (!tweetUrl || typeof tweetUrl !== 'string') {
        return res.status(400).json({ error: 'Missing tweetUrl' });
    }
    if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: 'Missing walletAddress' });
    }

    const tweetId = extractTweetId(tweetUrl.trim());
    if (!tweetId) {
        return res.status(400).json({ error: 'Invalid tweet URL. Use a link like https://x.com/user/status/123' });
    }

    // ── Rate limiting (IP-based) ──
    const ip = getClientIp(req);
    const rlKey = `rl:${ip}`;
    const rlCount = await kv.incr(rlKey);
    if (rlCount === 1) await kv.expire(rlKey, RATE_LIMIT_WINDOW_S);
    if (rlCount > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests. Please wait a minute.', retry: false });
    }

    // ── Check if wallet already verified ──
    const existingAuthor = await kv.get<string>(`wallet:${walletAddress}`);
    if (existingAuthor) {
        return res.status(409).json({ error: 'This wallet is already verified.', status: 'already_verified' });
    }

    // ── Check if tweet already used ──
    const existingTweet = await kv.get<string>(`tweet:${tweetId}`);
    if (existingTweet) {
        return res.status(409).json({ error: 'This tweet has already been used for verification.' });
    }

    // ── Fetch tweet + author from X API v2 ──
    let tweetData: {
        data?: { text: string; author_id: string };
        includes?: { users: Array<{ id: string; username: string; created_at: string; public_metrics: { followers_count: number } }> };
        errors?: Array<{ detail: string }>;
    };

    try {
        const xResp = await fetch(
            `https://api.twitter.com/2/tweets/${tweetId}?expansions=author_id&user.fields=created_at,public_metrics&tweet.fields=text`,
            { headers: { Authorization: `Bearer ${TWITTER_BEARER}` } },
        );
        if (!xResp.ok) {
            const errBody = await xResp.text();
            console.error('X API error:', xResp.status, errBody);
            return res.status(502).json({ error: 'Failed to fetch tweet from X. Please try again.' });
        }
        tweetData = await xResp.json();
    } catch (e) {
        console.error('X API fetch error:', e);
        return res.status(502).json({ error: 'Could not reach X API.' });
    }

    if (!tweetData.data || tweetData.errors?.length) {
        return res.status(404).json({ error: 'Tweet not found. Make sure it is public.' });
    }

    // ── Validate tweet content ──
    const tweetText = tweetData.data.text;
    if (!tweetText.toLowerCase().includes('#blockido')) {
        return res.status(400).json({ error: 'Tweet must include the #BlockIDO hashtag.' });
    }
    // Check if wallet address (full or truncated) is in the tweet
    const addrInTweet = tweetText.includes(walletAddress) ||
        (walletAddress.length > 20 && tweetText.includes(walletAddress.slice(0, 12)) && tweetText.includes(walletAddress.slice(-8)));
    if (!addrInTweet) {
        return res.status(400).json({ error: 'Tweet does not contain your wallet address.' });
    }

    // ── Validate author ──
    const author = tweetData.includes?.users?.[0];
    if (!author) {
        return res.status(400).json({ error: 'Could not retrieve author info.' });
    }

    const accountAge = (Date.now() - new Date(author.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (accountAge < MIN_ACCOUNT_AGE_DAYS) {
        return res.status(403).json({
            error: `X account must be at least ${MIN_ACCOUNT_AGE_DAYS} days old. Yours is ${Math.floor(accountAge)} days.`,
        });
    }

    const followers = author.public_metrics.followers_count;
    if (followers < MIN_FOLLOWERS) {
        return res.status(403).json({
            error: `X account must have at least ${MIN_FOLLOWERS} followers. You have ${followers}.`,
        });
    }

    // ── Anti-sybil: one X account = one wallet ──
    const existingWallet = await kv.get<string>(`twitter:${author.id}`);
    if (existingWallet && existingWallet !== walletAddress) {
        return res.status(409).json({ error: 'This X account is already linked to a different wallet.' });
    }

    // ── Distributed lock for UTXO contention ──
    const lockKey = 'lock:whitelist-tx';
    const lockAcquired = await kv.set(lockKey, Date.now().toString(), { nx: true, ex: 120 });
    if (!lockAcquired) {
        return res.status(429).json({ error: 'Verification in progress, please retry in a few seconds.', retry: true });
    }

    try {
        // ── Derive owner wallet + send setWhitelist TX ──
        const { Mnemonic, AddressTypes, MLDSASecurityLevel, ABIDataTypes } = await import('@btc-vision/transaction');
        const { getContract, JSONRpcProvider, BitcoinAbiTypes } = await import('opnet');
        const { networks } = await import('@btc-vision/bitcoin');

        const NETWORK = NETWORK_NAME === 'mainnet' ? networks.bitcoin : networks.opnetTestnet;
        const provider = new JSONRpcProvider({ url: OPNET_RPC, network: NETWORK });

        const mnemonic = new Mnemonic(OWNER_MNEMONIC, '', NETWORK, MLDSASecurityLevel.LEVEL2);
        const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

        const WHITELIST_ABI = [{
            name: 'setWhitelist',
            type: BitcoinAbiTypes.Function,
            inputs: [
                { name: 'user', type: ABIDataTypes.ADDRESS },
                { name: 'allowed', type: ABIDataTypes.BOOL },
            ],
            outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        }];

        // Resolve the user's wallet to an Address object
        const pubKeyInfo = await provider.getPublicKeyInfo(walletAddress, true);
        if (!pubKeyInfo || !pubKeyInfo.originalPubKey) {
            return res.status(400).json({
                error: 'Wallet address not found on-chain. Make sure you have made at least one transaction.',
            });
        }

        const contract = getContract(IDO_ADDRESS, WHITELIST_ABI, provider, NETWORK, wallet.address);
        const sim = await (contract as any).setWhitelist(pubKeyInfo.originalPubKey, true);
        const receipt = await sim.sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            refundTo: wallet.p2tr,
            maximumAllowedSatToSpend: 50_000n,
            feeRate: 2,
            network: NETWORK,
        });

        const txId = receipt?.transactionId || null;
        console.log(`[verify-tweet] Whitelist TX sent for @${author.username} → ${walletAddress}: ${txId}`);

        // ── Store mappings in KV ──
        await Promise.all([
            kv.set(`twitter:${author.id}`, walletAddress),
            kv.set(`wallet:${walletAddress}`, author.id),
            kv.set(`tweet:${tweetId}`, JSON.stringify({
                walletAddress,
                authorId: author.id,
                username: author.username,
                txId,
                timestamp: Date.now(),
            })),
        ]);

        return res.status(200).json({
            status: 'verified',
            message: 'Wallet whitelisted! Wait for the next block confirmation, then you can buy $BLOCK.',
            txId,
            username: author.username,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[verify-tweet] On-chain TX error:', msg);
        return res.status(500).json({ error: 'Failed to send whitelist transaction. Please try again later.' });
    } finally {
        // Always release the lock
        await kv.del(lockKey);
    }
}
