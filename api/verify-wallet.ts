import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';

// ─── Config ──────────────────────────────────────────────────────
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
const OWNER_MNEMONIC = process.env.OWNER_MNEMONIC || '';
const OPNET_RPC = process.env.OPNET_RPC || 'https://testnet.opnet.org';
const NETWORK_NAME = process.env.VITE_NETWORK || 'testnet';
const IDO_ADDRESS = process.env.BLOCK_IDO_ADDRESS || '';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_S = 60;

// ─── Helpers ─────────────────────────────────────────────────────
function getClientIp(req: VercelRequest): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    if (Array.isArray(forwarded)) return forwarded[0];
    return req.socket?.remoteAddress || 'unknown';
}

/** Extract /24 subnet from IPv4 or /48 from IPv6 */
function getSubnet(ip: string): string {
    if (!ip) return 'unknown';
    // IPv4: 1.2.3.4 → 1.2.3.0/24
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }
    // IPv6: take first 3 groups → /48
    if (ip.includes(':')) {
        const expanded = ip.split(':').slice(0, 3).join(':');
        return `${expanded}::/48`;
    }
    return ip;
}

// ─── Main handler ────────────────────────────────────────────────
// Anti-sybil layers (same as BlockLottery faucet):
// 1. Cloudflare Turnstile CAPTCHA (invisible) — blocks bots
// 2. Turnstile score filtering — rejects low-confidence tokens
// 3. 1 whitelist per wallet address (permanent)
// 4. 1 whitelist per IP (permanent)
// 5. 1 whitelist per /24 subnet (permanent) — blocks VPN/datacenter clusters
// 6. Distributed UTXO lock — prevents concurrent TX conflicts
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ── Validate env ──
    if (!TURNSTILE_SECRET) return res.status(500).json({ error: 'Server misconfigured: missing Turnstile secret' });
    if (!OWNER_MNEMONIC) return res.status(500).json({ error: 'Server misconfigured: missing owner mnemonic' });
    if (!IDO_ADDRESS) return res.status(500).json({ error: 'Server misconfigured: missing IDO address' });

    // ── Parse body ──
    const { walletAddress, turnstileToken } = req.body || {};
    if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: 'Missing walletAddress' });
    }
    if (!turnstileToken || typeof turnstileToken !== 'string') {
        return res.status(400).json({ error: 'Verification required' });
    }

    // ── Turnstile verification ──
    const ip = getClientIp(req);
    try {
        const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: TURNSTILE_SECRET,
                response: turnstileToken,
                remoteip: ip,
            }),
        });
        const tsData = await tsRes.json() as { success: boolean; score?: number };
        if (!tsData.success) {
            return res.status(400).json({ error: 'Captcha verification failed. Please try again.' });
        }
        // Reject low-confidence tokens (score 0-1, higher = more human)
        if (typeof tsData.score === 'number' && tsData.score < 0.3) {
            return res.status(400).json({ error: 'Captcha verification failed. Please try again.' });
        }
    } catch {
        return res.status(502).json({ error: 'Captcha service unreachable. Please try again.' });
    }

    // ── Rate limiting (IP-based, short window) ──
    const rlKey = `ido:rl:${ip}`;
    const rlCount = await kv.incr(rlKey);
    if (rlCount === 1) await kv.expire(rlKey, RATE_LIMIT_WINDOW_S);
    if (rlCount > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests. Please wait a minute.', retry: false });
    }

    // ── Anti-sybil checks (parallel KV lookups) ──
    const subnet = getSubnet(ip);
    const [existingWallet, existingIp, existingSubnet] = await Promise.all([
        kv.get<string>(`ido:wallet:${walletAddress}`),
        kv.get<string>(`ido:ip:${ip}`),
        kv.get<string>(`ido:subnet:${subnet}`),
    ]);

    if (existingWallet) {
        return res.status(409).json({ error: 'This wallet is already verified.', status: 'already_verified' });
    }
    if (existingIp) {
        return res.status(409).json({ error: 'Already verified from this network. One verification per IP.' });
    }
    if (existingSubnet) {
        return res.status(409).json({ error: 'Already verified from this network. One verification per network.' });
    }

    // ── Distributed lock for UTXO contention ──
    const lockKey = 'ido:lock:whitelist-tx';
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
        const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);

        const WHITELIST_ABI = [{
            name: 'setWhitelist',
            type: BitcoinAbiTypes.Function,
            inputs: [
                { name: 'user', type: ABIDataTypes.ADDRESS },
                { name: 'allowed', type: ABIDataTypes.BOOL },
            ],
            outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        }];

        // Resolve the user's wallet to an Address object (isContract = false for user wallets)
        const userAddress = await provider.getPublicKeyInfo(walletAddress, false);
        if (!userAddress) {
            return res.status(400).json({
                error: 'Wallet address not found on-chain. Make sure you have made at least one transaction.',
            });
        }

        const contract = getContract(IDO_ADDRESS, WHITELIST_ABI, provider, NETWORK, wallet.address);
        const sim = await (contract as any).setWhitelist(userAddress, true);
        const receipt = await sim.sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            refundTo: wallet.p2tr,
            maximumAllowedSatToSpend: 50_000n,
            feeRate: 2,
            network: NETWORK,
        });

        const txId = receipt?.transactionId || null;
        console.log(`[verify-wallet] Whitelist TX sent for ${walletAddress} (IP: ${ip}): ${txId}`);

        // ── Store anti-sybil keys in KV (permanent, no TTL) ──
        const now = Date.now();
        await Promise.all([
            kv.set(`ido:wallet:${walletAddress}`, JSON.stringify({ ip, subnet, txId, timestamp: now })),
            kv.set(`ido:ip:${ip}`, JSON.stringify({ wallet: walletAddress, timestamp: now })),
            kv.set(`ido:subnet:${subnet}`, JSON.stringify({ wallet: walletAddress, ip, timestamp: now })),
        ]);

        return res.status(200).json({
            status: 'verified',
            message: 'Wallet whitelisted! Wait for the next block confirmation, then you can buy $BLOCK.',
            txId,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[verify-wallet] On-chain TX error:', msg);
        return res.status(500).json({ error: 'Failed to send whitelist transaction. Please try again later.' });
    } finally {
        // Always release the lock
        await kv.del(lockKey);
    }
}
