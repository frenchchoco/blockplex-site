import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import {
    CONTRACTS,
    DISPLAY_ADDRESSES,
    BLOCK_IDO_ABI,
    MOTO_DECIMALS,
    formatBlock,
    formatMoto,
    BLOCK_UNITS,
} from '../../config/contracts';
import type {
    Address,
    AbstractRpcProvider,
    ShowToast,
    UseOpWalletReturn,
    OP20Contract,
} from '../../types';
import { BitcoinUtils } from 'opnet';
import { friendlyWalletError } from '../../utils/walletErrors';
import './IdoTab.css';

interface IdoTabProps {
    walletAddress: string | null;
    address: Address | null;
    isConnected: boolean;
    provider: AbstractRpcProvider | null;
    showToast: ShowToast;
    callContract: UseOpWalletReturn['callContract'];
    readContract: UseOpWalletReturn['readContract'];
    getOP20Balance: UseOpWalletReturn['getOP20Balance'];
    getOP20ContractCached: UseOpWalletReturn['getOP20ContractCached'];
    onBalanceRefresh: () => void;
    effectiveNetwork: string;
}

interface PhaseLabel {
    name: string;
    bonus: string;
    rate: string;
}

// Testnet IDO: only Phase 1 has a bonus (the testnet contract uses 0 bps for P2/P3)
const PHASE_LABELS_TESTNET: Record<number, PhaseLabel> = {
    1: { name: 'PHASE 1', bonus: '+50%', rate: '75 BLOCK / MOTO' },
    2: { name: 'PHASE 2', bonus: 'BASE', rate: '50 BLOCK / MOTO' },
    3: { name: 'PHASE 3', bonus: 'BASE', rate: '50 BLOCK / MOTO' },
    0: { name: 'SOLD OUT', bonus: '\u2014', rate: '\u2014' },
};

// Mainnet IDO: degressive bonus structure to incentivize early buyers
const PHASE_LABELS_MAINNET: Record<number, PhaseLabel> = {
    1: { name: 'PHASE 1', bonus: '+50%', rate: '75 BLOCK / MOTO' },
    2: { name: 'PHASE 2', bonus: '+25%', rate: '62.5 BLOCK / MOTO' },
    3: { name: 'PHASE 3', bonus: '+10%', rate: '55 BLOCK / MOTO' },
    0: { name: 'SOLD OUT', bonus: '\u2014', rate: '\u2014' },
};

const MOTO_PRESETS: number[] = [1, 5, 10, 50, 100];

interface PhaseBreakdown {
    phase: number;
    bonus: string;
    rate: string;
    cap: string;
}

const PHASE_BREAKDOWN_TESTNET: PhaseBreakdown[] = [
    { phase: 1, bonus: '+50%', rate: '75', cap: '6,670,000' },
    { phase: 2, bonus: 'BASE', rate: '50', cap: '6,670,000' },
    { phase: 3, bonus: 'BASE', rate: '50', cap: '6,670,000' },
];

const PHASE_BREAKDOWN_MAINNET: PhaseBreakdown[] = [
    { phase: 1, bonus: '+50%', rate: '75', cap: '6,670,000' },
    { phase: 2, bonus: '+25%', rate: '62.5', cap: '6,670,000' },
    { phase: 3, bonus: '+10%', rate: '55', cap: '6,670,000' },
];

export default function IdoTab({
    walletAddress,
    address,
    isConnected,
    provider,
    showToast,
    callContract,
    readContract,
    getOP20Balance,
    getOP20ContractCached,
    onBalanceRefresh,
    effectiveNetwork,
}: IdoTabProps) {
    const [phase, setPhase] = useState<number>(0);
    const [totalSold, setTotalSold] = useState<bigint>(0n);
    const [phaseSold, setPhaseSold] = useState<bigint>(0n);
    const [phaseCap, setPhaseCap] = useState<bigint>(0n);
    const [bonusBps, setBonusBps] = useState<bigint>(0n);
    const [totalMotoRaised, setTotalMotoRaised] = useState<bigint>(0n);
    const [blockPerMoto, setBlockPerMoto] = useState<bigint>(50n);
    const [paused, setPaused] = useState<boolean>(false);
    const [whitelistEnabled, setWhitelistEnabled] = useState<boolean>(false);
    const [userWhitelisted, setUserWhitelisted] = useState<boolean>(false);

    const [motoBalance, setMotoBalance] = useState<bigint>(0n);
    const [userPurchases, setUserPurchases] = useState<bigint>(0n);
    const [motoAllowance, setMotoAllowance] = useState<bigint | null>(null);
    const [allowanceLoaded, setAllowanceLoaded] = useState<boolean>(false);

    const [motoAmount, setMotoAmount] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [approvePending, setApprovePending] = useState<boolean>(false);
    const [buyPending, setBuyPending] = useState<boolean>(false);
    const [pendingBlockEstimate, setPendingBlockEstimate] = useState<bigint>(0n);
    const [pendingMotoSpent, setPendingMotoSpent] = useState<bigint>(0n);
    const [infiniteApproval, setInfiniteApproval] = useState<boolean>(false);

    // ─── Turnstile verification state ─────────────────────────────
    const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAACf3vVNJJ3WtJoSx';
    type VerifyStep = 'idle' | 'submitting' | 'pending' | 'verified' | 'error';
    const [verifyStep, setVerifyStep] = useState<VerifyStep>('idle');
    const [verifyError, setVerifyError] = useState<string>('');
    const pollWhitelistRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const turnstileRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);

    // ─── Persist pending buy across page refreshes ────────────────
    const PENDING_KEY = 'ido_pending_buy';
    const savePending = useCallback((estimate: bigint, prevTotalSold: bigint, prevUserPurchases: bigint, motoSpent: bigint): void => {
        try {
            localStorage.setItem(PENDING_KEY, JSON.stringify({
                estimate: estimate.toString(),
                prevTotalSold: prevTotalSold.toString(),
                prevUserPurchases: prevUserPurchases.toString(),
                motoSpent: motoSpent.toString(),
                ts: Date.now(),
            }));
        } catch { /* localStorage unavailable */ }
    }, []);
    const clearPending = useCallback((): void => {
        try { localStorage.removeItem(PENDING_KEY); } catch { /* */ }
    }, []);

    const loadIDOInfo = useCallback(async (): Promise<void> => {
        if (!provider || !CONTRACTS.BLOCK_IDO) return;
        try {
            const info = await readContract(CONTRACTS.BLOCK_IDO, BLOCK_IDO_ABI, 'getIDOInfo');
            if (info) {
                setPhase(Number(info.phase ?? 0));
                setTotalSold(BigInt(info.totalSold as bigint ?? 0));
                setPhaseSold(BigInt(info.phaseSold as bigint ?? 0));
                setPhaseCap(BigInt(info.phaseCap as bigint ?? 0));
                setBonusBps(BigInt(info.bonusBps as bigint ?? 0));
                setTotalMotoRaised(BigInt(info.totalMotoRaised as bigint ?? 0));
                setBlockPerMoto(BigInt(info.blockPerMoto as bigint ?? 50));
                setPaused(!!info.paused);
                setWhitelistEnabled(!!info.whitelistEnabled);
            }
        } catch (e) {
            console.error('loadIDOInfo:', e);
        }
    }, [provider, readContract]);

    useEffect((): void => {
        setMotoBalance(0n);
        setUserPurchases(0n);
        setMotoAllowance(null);
        setAllowanceLoaded(false);
        setMotoAmount('');
        setBuyPending(false); setPendingMotoSpent(0n);
        setPendingBlockEstimate(0n);
    }, [address]);

    const loadUserData = useCallback(async (): Promise<void> => {
        if (!provider || !address || !CONTRACTS.BLOCK_IDO) return;
        try {
            const motoBal: bigint = await getOP20Balance(CONTRACTS.MOTO_TOKEN);
            setMotoBalance(motoBal < 0n ? 0n : motoBal);

            const purchases = await readContract(CONTRACTS.BLOCK_IDO, BLOCK_IDO_ABI, 'getUserPurchases', [address]);
            if (purchases) {
                setUserPurchases(BigInt(purchases.totalBlock as bigint ?? 0));
            }

            // Check whitelist status
            try {
                const wlResult = await readContract(CONTRACTS.BLOCK_IDO, BLOCK_IDO_ABI, 'isWhitelisted', [address]);
                if (wlResult) setUserWhitelisted(!!wlResult.whitelisted);
            } catch {
                // Contract may not support whitelist yet — ignore
            }

            try {
                const motoContract: OP20Contract | null = getOP20ContractCached(CONTRACTS.MOTO_TOKEN);
                if (!motoContract) { setAllowanceLoaded(true); return; }
                const idoAddress = await provider.getPublicKeyInfo(CONTRACTS.BLOCK_IDO, true);
                if (!idoAddress) { setAllowanceLoaded(true); return; }
                const allowanceResult = await motoContract.allowance(address, idoAddress);
                const val: bigint = BigInt(allowanceResult?.properties?.remaining ?? 0);
                setMotoAllowance(val);
                setAllowanceLoaded(true);
                if (val > 0n) setApprovePending(false);
            } catch (allowErr) {
                console.error('[IDO] MOTO allowance check failed:', allowErr);
                setAllowanceLoaded(true);
            }
        } catch (e) {
            console.error('loadUserData:', e);
        }
    }, [provider, address, readContract, getOP20Balance, getOP20ContractCached]);

    useEffect((): (() => void) => {
        if (!provider) return () => {};
        const load = (): void => {
            loadIDOInfo();
            if (isConnected) loadUserData();
        };
        load();
        const interval = setInterval(load, 30_000);
        return () => clearInterval(interval);
    }, [provider, isConnected, loadIDOInfo, loadUserData]);

    const motoInput: number = parseFloat(motoAmount) || 0;
    const motoRaw: bigint = motoInput > 0 ? BitcoinUtils.expandToDecimals(motoInput, MOTO_DECIMALS) : 0n;
    const PHASE_LABELS = effectiveNetwork === 'mainnet' ? PHASE_LABELS_MAINNET : PHASE_LABELS_TESTNET;
    const PHASE_BREAKDOWN = effectiveNetwork === 'mainnet' ? PHASE_BREAKDOWN_MAINNET : PHASE_BREAKDOWN_TESTNET;
    const phaseInfo: PhaseLabel = PHASE_LABELS[phase] || PHASE_LABELS[0];

    const DECIMAL_DIFF: bigint = 10_000_000_000n;
    const estimatedBlock: bigint = motoRaw > 0n
        ? (motoRaw * blockPerMoto * (10000n + bonusBps)) / (10000n * DECIMAL_DIFF)
        : 0n;

    const totalCap: bigint = phaseCap > 0n ? phaseCap * 3n : 2_001_000_000_000_000n;
    const overallProgress: number = totalCap > 0n ? Number(totalSold * 10000n / totalCap) / 100 : 0;
    const phaseProgress: number = phaseCap > 0n ? Number(phaseSold * 10000n / phaseCap) / 100 : 0;
    // Pending purchase progress (pulsing segment on bars)
    const pendingOverallPct: number = buyPending && pendingBlockEstimate > 0n && totalCap > 0n
        ? Number(pendingBlockEstimate * 10000n / totalCap) / 100 : 0;
    const pendingPhasePct: number = buyPending && pendingBlockEstimate > 0n && phaseCap > 0n
        ? Number(pendingBlockEstimate * 10000n / phaseCap) / 100 : 0;

    const isMainnet: boolean = effectiveNetwork === 'mainnet';
    const idoEnded: boolean = phase === 0 && totalSold > 0n;
    const idoNotStarted: boolean = isMainnet && phase === 0 && totalSold === 0n;
    const testnetPreview: boolean = !isMainnet && phase === 0 && totalSold === 0n;
    const idoNotDeployed: boolean = !CONTRACTS.BLOCK_IDO;
    const whitelistBlocked: boolean = whitelistEnabled && !userWhitelisted && isConnected;

    const MAX_PER_USER: bigint = 200_000n * BLOCK_UNITS; // 200,000 BLOCK (1% of IDO allocation)
    const userRemaining: bigint = MAX_PER_USER > userPurchases ? MAX_PER_USER - userPurchases : 0n;
    const userCapPct: number = Number(userPurchases * 10000n / MAX_PER_USER) / 100;
    const nearCap: boolean = userPurchases > 0n && userRemaining < estimatedBlock && estimatedBlock > 0n;

    // ─── X verification: poll whitelist after TX ─────────────────
    const startPollingWhitelist = useCallback((): void => {
        if (pollWhitelistRef.current) clearInterval(pollWhitelistRef.current);
        const MAX_POLL_MS = 60 * 60_000;
        const startTime = Date.now();
        pollWhitelistRef.current = setInterval(async () => {
            if (Date.now() - startTime > MAX_POLL_MS) {
                if (pollWhitelistRef.current) clearInterval(pollWhitelistRef.current);
                pollWhitelistRef.current = null;
                setVerifyStep('error');
                setVerifyError('Whitelist confirmation timed out. Your TX may still be pending.');
                return;
            }
            try {
                const wlResult = await readContract(CONTRACTS.BLOCK_IDO, BLOCK_IDO_ABI, 'isWhitelisted', [address]);
                if (wlResult && wlResult.whitelisted) {
                    setUserWhitelisted(true);
                    setVerifyStep('verified');
                    showToast('Wallet whitelisted! You can now buy $BLOCK.', 'success');
                    if (pollWhitelistRef.current) clearInterval(pollWhitelistRef.current);
                    pollWhitelistRef.current = null;
                }
            } catch { /* retry silently */ }
        }, 15_000);
    }, [readContract, address, showToast]);

    // Cleanup whitelist polling on unmount
    useEffect(() => {
        return () => { if (pollWhitelistRef.current) clearInterval(pollWhitelistRef.current); };
    }, []);

    // Auto-dismiss verified panel after 3s → shows buy interface
    useEffect((): (() => void) => {
        if (verifyStep === 'verified') {
            const t = setTimeout(() => setVerifyStep('idle'), 3000);
            return () => clearTimeout(t);
        }
        return () => {};
    }, [verifyStep]);

    // ─── Turnstile widget rendering ─────────────────────────────────
    useEffect((): (() => void) => {
        if (!TURNSTILE_SITE_KEY || !whitelistBlocked || verifyStep !== 'idle') return () => {};
        const renderWidget = (): void => {
            if (!turnstileRef.current || !(window as any).turnstile) return;
            if (widgetIdRef.current !== null) {
                try { (window as any).turnstile.remove(widgetIdRef.current); } catch { /* */ }
            }
            widgetIdRef.current = (window as any).turnstile.render(turnstileRef.current, {
                sitekey: TURNSTILE_SITE_KEY,
                size: 'invisible',
                callback: () => { /* token ready */ },
            });
        };
        if ((window as any).turnstile) { renderWidget(); }
        else {
            const interval = setInterval(() => {
                if ((window as any).turnstile) { clearInterval(interval); renderWidget(); }
            }, 500);
            return () => clearInterval(interval);
        }
        return () => {};
    }, [TURNSTILE_SITE_KEY, whitelistBlocked, verifyStep]);

    const handleVerify = useCallback(async (): Promise<void> => {
        setVerifyStep('submitting');
        setVerifyError('');

        // Get Turnstile token
        let turnstileToken = '';
        if ((window as any).turnstile && widgetIdRef.current != null) {
            turnstileToken = (window as any).turnstile.getResponse(widgetIdRef.current) || '';
            if (!turnstileToken) {
                // Reset and wait for a fresh token (up to 15s)
                (window as any).turnstile.reset(widgetIdRef.current);
                await new Promise<void>((resolve, reject) => {
                    const t = setTimeout(() => { clearInterval(check); reject(new Error('Captcha timeout')); }, 15_000);
                    const check = setInterval(() => {
                        const token: string | undefined = (window as any).turnstile?.getResponse(widgetIdRef.current!);
                        if (token) { clearInterval(check); clearTimeout(t); turnstileToken = token; resolve(); }
                    }, 500);
                });
            }
        }

        if (!turnstileToken) {
            setVerifyStep('error');
            setVerifyError('Captcha verification failed. Please refresh and try again.');
            return;
        }

        try {
            const resp = await fetch('/api/verify-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress, turnstileToken }),
            });
            const data = await resp.json();

            if (resp.status === 429 && data.retry) {
                showToast('Verification queue busy, retrying...', 'info');
                setTimeout(() => { void handleVerify(); }, 5000);
                return;
            }

            if (resp.status === 409 && data.status === 'already_verified') {
                setVerifyStep('pending');
                startPollingWhitelist();
                return;
            }

            if (!resp.ok) {
                setVerifyStep('error');
                setVerifyError(data.error || 'Verification failed');
                return;
            }

            // TX sent — poll on-chain whitelist
            setVerifyStep('pending');
            showToast('Whitelist TX sent! Waiting for block confirmation...', 'info');
            startPollingWhitelist();
        } catch {
            setVerifyStep('error');
            setVerifyError('Network error — please try again');
        }
    }, [walletAddress, showToast, startPollingWhitelist]);

    const pollAllowanceRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollBuyRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startPollingAllowance = useCallback((): void => {
        if (pollAllowanceRef.current) clearInterval(pollAllowanceRef.current);
        const MAX_POLL_MS = 60 * 60_000; // 1 hour — blocks can be slow on mainnet
        const startTime = Date.now();

        pollAllowanceRef.current = setInterval(async () => {
            if (Date.now() - startTime > MAX_POLL_MS) {
                if (pollAllowanceRef.current) clearInterval(pollAllowanceRef.current);
                pollAllowanceRef.current = null;
                setApprovePending(false);
                return;
            }
            try {
                const motoContract: OP20Contract | null = getOP20ContractCached(CONTRACTS.MOTO_TOKEN);
                if (!motoContract || !provider || !address) return;
                const idoAddress = await provider.getPublicKeyInfo(CONTRACTS.BLOCK_IDO, true);
                if (!idoAddress) return;
                const allowanceResult = await motoContract.allowance(address, idoAddress);
                const val: bigint = BigInt(allowanceResult?.properties?.remaining ?? 0);
                if (val > 0n) {
                    setMotoAllowance(val);
                    setAllowanceLoaded(true);
                    setApprovePending(false);
                    if (pollAllowanceRef.current) clearInterval(pollAllowanceRef.current);
                    pollAllowanceRef.current = null;
                }
            } catch {
                // Silently retry
            }
        }, 10_000); // every 10s
    }, [getOP20ContractCached, provider, address]);

    const startPollingBuy = useCallback((prevTotalSold: bigint, prevUserPurchases: bigint): void => {
        if (pollBuyRef.current) clearInterval(pollBuyRef.current);
        const MAX_POLL_MS = 60 * 60_000; // 1 hour
        const startTime = Date.now();

        pollBuyRef.current = setInterval(async () => {
            if (Date.now() - startTime > MAX_POLL_MS) {
                if (pollBuyRef.current) clearInterval(pollBuyRef.current);
                pollBuyRef.current = null;
                setBuyPending(false); setPendingMotoSpent(0n);
                setPendingBlockEstimate(0n);
                clearPending();
                showToast('Buy confirmation timed out — check your balance manually', 'info');
                return;
            }
            try {
                // Check IDO state
                const info = await readContract(CONTRACTS.BLOCK_IDO, BLOCK_IDO_ABI, 'getIDOInfo');
                if (!info) return;
                const newTotalSold: bigint = BigInt(info.totalSold as bigint ?? 0);

                // Check user purchases
                let newUserPurchases: bigint = prevUserPurchases;
                if (address) {
                    const purchases = await readContract(CONTRACTS.BLOCK_IDO, BLOCK_IDO_ABI, 'getUserPurchases', [address]);
                    if (purchases) newUserPurchases = BigInt(purchases.totalBlock as bigint ?? 0);
                }

                if (newTotalSold !== prevTotalSold || newUserPurchases !== prevUserPurchases) {
                    // Buy confirmed — update all state
                    setPhase(Number(info.phase ?? 0));
                    setTotalSold(newTotalSold);
                    setPhaseSold(BigInt(info.phaseSold as bigint ?? 0));
                    setPhaseCap(BigInt(info.phaseCap as bigint ?? 0));
                    setBonusBps(BigInt(info.bonusBps as bigint ?? 0));
                    setTotalMotoRaised(BigInt(info.totalMotoRaised as bigint ?? 0));
                    setBlockPerMoto(BigInt(info.blockPerMoto as bigint ?? 50));
                    setPaused(!!info.paused);
                    setWhitelistEnabled(!!info.whitelistEnabled);
                    setUserPurchases(newUserPurchases);
                    setBuyPending(false); setPendingMotoSpent(0n);
                    setPendingBlockEstimate(0n);
                    clearPending();
                    // Refresh MOTO balance + header balances
                    loadUserData();
                    if (onBalanceRefresh) onBalanceRefresh();
                    showToast('Purchase confirmed on-chain!', 'success');
                    if (pollBuyRef.current) clearInterval(pollBuyRef.current);
                    pollBuyRef.current = null;
                }
            } catch {
                // Silently retry
            }
        }, 10_000); // every 10s
    }, [readContract, address, loadUserData, onBalanceRefresh, showToast]);

    // Restore pending buy from localStorage on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(PENDING_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            const age = Date.now() - (saved.ts || 0);
            if (age > 60 * 60_000) { clearPending(); return; } // expired (>1h)
            const est = BigInt(saved.estimate || '0');
            const prevTotal = BigInt(saved.prevTotalSold || '0');
            const prevUser = BigInt(saved.prevUserPurchases || '0');
            if (est > 0n) {
                setBuyPending(true);
                setPendingBlockEstimate(est);
                setPendingMotoSpent(BigInt(saved.motoSpent || '0'));
                startPollingBuy(prevTotal, prevUser);
            }
        } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        return () => {
            if (pollAllowanceRef.current) clearInterval(pollAllowanceRef.current);
            if (pollBuyRef.current) clearInterval(pollBuyRef.current);
        };
    }, []);

    const handleApproveMoto = async (): Promise<void> => {
        if (!isConnected) { showToast('Connect your wallet first', 'error'); return; }
        try {
            setLoading(true);
            showToast('Approving MOTO spend for IDO...', 'info');
            // Infinite: max uint256, Limited: 10,000 MOTO (covers max user cap of ~7,000 MOTO)
            const MAX_UINT256: bigint = (1n << 256n) - 1n;
            const approveAmount: bigint = infiniteApproval
                ? MAX_UINT256
                : BitcoinUtils.expandToDecimals(10_000, MOTO_DECIMALS);
            const motoContract: OP20Contract | null = getOP20ContractCached(CONTRACTS.MOTO_TOKEN);
            if (!motoContract) throw new Error('MOTO contract not available');
            const idoAddress = await provider!.getPublicKeyInfo(CONTRACTS.BLOCK_IDO, true);
            if (!idoAddress) throw new Error('Could not resolve IDO contract address');
            const sim = await motoContract.increaseAllowance(idoAddress, approveAmount);
            await sim.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress!,
                maximumAllowedSatToSpend: 100_000n,
                network: provider!.network,
            });
            setApprovePending(true);
            showToast('MOTO approval TX sent! Polling allowance...', 'success');
            startPollingAllowance();
        } catch (e) {
            console.error('[IDO Approve] error:', e);
            const msg: string = (e as Error).message || '';
            if (msg.includes('Method not found')) {
                showToast('MOTO contract does not support this method \u2014 contact support.', 'error');
            } else {
                showToast('Approve failed: ' + friendlyWalletError(e), 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBuy = async (): Promise<void> => {
        if (!isConnected) { showToast('Connect your wallet first', 'error'); return; }
        if (idoNotStarted) { showToast('IDO is not active yet', 'error'); return; }
        if (testnetPreview) { showToast('IDO contract is in preview — phase not active on-chain yet', 'info'); return; }
        if (paused) { showToast('IDO is currently paused', 'error'); return; }
        if (whitelistBlocked) { showToast('Your wallet is not whitelisted', 'error'); return; }
        if (motoRaw <= 0n) { showToast('Enter a MOTO amount', 'error'); return; }
        if (motoBalance < motoRaw) { showToast('Not enough MOTO', 'error'); return; }
        if (userRemaining === 0n && userPurchases > 0n) { showToast('Wallet cap reached (200,000 BLOCK)', 'error'); return; }

        try {
            setLoading(true);
            showToast('Buying $BLOCK \u2014 confirm in wallet...', 'info');
            const result = await callContract(CONTRACTS.BLOCK_IDO, BLOCK_IDO_ABI, 'buy', [motoRaw]);
            const props = result?.properties;
            const received: bigint = BigInt(props?.blockReceived as bigint ?? 0);
            if (received > 0n) {
                showToast(`TX sent \u2014 ${formatBlock(received)} $BLOCK pending confirmation...`, 'success');
            } else {
                showToast('Buy TX sent! Waiting for block confirmation...', 'success');
            }
            // Store pending state so UI shows "waiting" until on-chain confirm
            const est = received > 0n ? received : estimatedBlock;
            setBuyPending(true);
            setPendingBlockEstimate(est);
            setPendingMotoSpent(motoRaw);
            savePending(est, totalSold, userPurchases, motoRaw);
            setMotoAmount('');
            // Start polling for on-chain confirmation (every 10s, up to 1h)
            startPollingBuy(totalSold, userPurchases);
        } catch (e) {
            console.error('[IDO Buy] error:', e);
            const msg = friendlyWalletError(e);
            showToast(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (idoNotDeployed) {
        return (
            <div className="ido-card">
                <div className="ido-section-title">$BLOCK IDO</div>
                <div className="ido-coming-soon">
                    <div className="ido-coming-icon">{'\ud83d\ude80'}</div>
                    <div className="ido-coming-text">IDO COMING SOON</div>
                    <div className="ido-coming-desc">
                        Buy $BLOCK with $MOTO at a bonus rate. Deploy the IDO contract to activate.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ido-tab">
            {/* Hero */}
            <div className="ido-hero">
                <div className="ido-hero-label">$BLOCK INITIAL OFFERING</div>
                <div className="ido-hero-phase">
                    {idoNotStarted ? 'STARTING SOON' : testnetPreview ? 'PHASE 1' : phaseInfo.name}
                </div>
                <div className="ido-hero-rate">
                    {phase > 0 ? (
                        <>
                            <span className="ido-rate-value">1 MOTO = {phaseInfo.rate.split(' ')[0]}</span>
                            <span className="ido-rate-unit">$BLOCK</span>
                            {phaseInfo.bonus !== 'BASE' && (
                                <span className="ido-bonus-badge">{phaseInfo.bonus} BONUS</span>
                            )}
                        </>
                    ) : idoNotStarted ? (
                        <span className="ido-starting-soon">Mainnet launch — March 17, 2026</span>
                    ) : idoEnded ? (
                        <span className="ido-sold-out">IDO COMPLETED</span>
                    ) : (
                        <span className="ido-starting-soon">Testnet — Phase 1 rate: 75 BLOCK / MOTO (+50% bonus)</span>
                    )}
                </div>
            </div>

            {/* Progress */}
            <div className="ido-progress-section">
                <div className="ido-progress-header">
                    <span className="ido-mono">OVERALL PROGRESS</span>
                    <span className="ido-mono ido-orange">{overallProgress.toFixed(1)}%</span>
                </div>
                <div className="ido-progress-bar ido-progress-phased">
                    <div className="ido-progress-fill" style={{ width: Math.min(overallProgress, 100) + '%' }} />
                    {pendingOverallPct > 0 && (
                        <div
                            className="ido-progress-pending"
                            style={{
                                left: Math.min(overallProgress, 100) + '%',
                                width: Math.min(pendingOverallPct, 100 - overallProgress) + '%',
                            }}
                        />
                    )}
                    <div className="ido-phase-marker" style={{ left: '33.33%' }} />
                    <div className="ido-phase-marker" style={{ left: '66.66%' }} />
                </div>
                <div className="ido-phase-labels">
                    <span className={`ido-phase-label ${phase === 1 || (testnetPreview) ? 'active' : phase > 1 || idoEnded ? 'done' : ''}`}>P1 · 6.67M</span>
                    <span className={`ido-phase-label ${phase === 2 ? 'active' : phase > 2 || idoEnded ? 'done' : ''}`}>P2 · 6.67M</span>
                    <span className={`ido-phase-label ${phase === 3 ? 'active' : idoEnded ? 'done' : ''}`}>P3 · 6.67M</span>
                </div>
                <div className="ido-progress-stats">
                    <span className="ido-mono">{formatBlock(totalSold)} SOLD</span>
                    <span className="ido-mono">{formatBlock(totalCap)} TOTAL</span>
                </div>

                {phase > 0 && (
                    <>
                        <div className="ido-progress-header" style={{ marginTop: 16 }}>
                            <span className="ido-mono">{phaseInfo.name} PROGRESS</span>
                            <span className="ido-mono ido-orange">{phaseProgress.toFixed(1)}%</span>
                        </div>
                        <div className="ido-progress-bar">
                            <div className="ido-progress-fill ido-orange-fill" style={{ width: Math.min(phaseProgress, 100) + '%' }} />
                            {pendingPhasePct > 0 && (
                                <div
                                    className="ido-progress-pending ido-pending-orange"
                                    style={{
                                        left: Math.min(phaseProgress, 100) + '%',
                                        width: Math.min(pendingPhasePct, 100 - phaseProgress) + '%',
                                    }}
                                />
                            )}
                        </div>
                        <div className="ido-progress-stats">
                            <span className="ido-mono">{formatBlock(phaseSold)} SOLD</span>
                            <span className="ido-mono">{formatBlock(phaseCap)} CAP</span>
                        </div>
                    </>
                )}
            </div>

            {/* Stats */}
            <div className="ido-stats-bar">
                <div className="ido-stat">
                    <div className="ido-stat-v">{formatMoto(totalMotoRaised)}</div>
                    <div className="ido-stat-l">MOTO RAISED</div>
                </div>
                <div className="ido-stat">
                    <div className="ido-stat-v">{formatBlock(totalSold)}</div>
                    <div className="ido-stat-l">BLOCK SOLD</div>
                </div>
                <div className="ido-stat">
                    <div className="ido-stat-v">{phase > 0 ? phase : testnetPreview ? 1 : '\u2014'}</div>
                    <div className="ido-stat-l">CURRENT PHASE</div>
                </div>
            </div>

            {/* Buy card */}
            <div className="ido-card">
                <div className="ido-section-title">BUY $BLOCK WITH MOTO</div>

                {paused ? (
                    <div className="ido-freeze-notice">IDO IS CURRENTLY PAUSED</div>
                ) : idoNotStarted ? (
                    <div className="ido-coming-soon-card">
                        <div className="ido-coming-icon">🚀</div>
                        <div className="ido-coming-text">IDO LAUNCHING MARCH 17</div>
                        <div className="ido-coming-desc">
                            Phase 1 gives you <strong>75 BLOCK per MOTO</strong> — that's a <strong>+50% bonus</strong> over the base rate of 50 BLOCK/MOTO.
                            Connect your wallet and get ready.
                        </div>
                    </div>
                ) : idoEnded ? (
                    <div className="ido-ended-notice">
                        IDO has ended — all 20,010,000 $BLOCK have been sold!
                    </div>
                ) : (
                    <>
                        <div className="ido-presets">
                            {MOTO_PRESETS.map((n: number) => (
                                <button
                                    key={n}
                                    className={`ido-preset-btn ${parseFloat(motoAmount) === n ? 'active' : ''}`}
                                    onClick={() => setMotoAmount(String(n))}
                                >
                                    {n} <span>MOTO</span>
                                </button>
                            ))}
                        </div>

                        <input
                            className="ido-input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="MOTO AMOUNT"
                            value={motoAmount}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setMotoAmount(e.target.value)}
                        />

                        {estimatedBlock > 0n && (
                            <div className="ido-quote">
                                <div>
                                    <div className="ido-mono">YOU RECEIVE (ESTIMATED)</div>
                                    <div className="ido-quote-val">{formatBlock(estimatedBlock)} $BLOCK</div>
                                </div>
                                {phaseInfo.bonus !== 'BASE' ? (
                                    <div className="ido-bonus-tag">{phaseInfo.bonus} BONUS</div>
                                ) : (
                                    <div className="ido-bonus-tag" style={{ opacity: 0.5 }}>BASE RATE</div>
                                )}
                            </div>
                        )}

                        {isConnected && (
                            <div className="ido-balance-row">
                                <span className="ido-mono">YOUR MOTO BALANCE</span>
                                <span className="ido-mono ido-orange">
                                    {formatMoto(motoBalance)} MOTO
                                    {buyPending && pendingMotoSpent > 0n && (
                                        <span className="ido-pending-moto"> (-{formatMoto(pendingMotoSpent)})</span>
                                    )}
                                </span>
                            </div>
                        )}

                        {(whitelistBlocked || verifyStep === 'verified') && (
                            <div className="ido-verify-panel">
                                {verifyStep === 'idle' && (
                                    <>
                                        <div className="ido-verify-icon">🔒</div>
                                        <div className="ido-verify-title">WALLET VERIFICATION REQUIRED</div>
                                        <div className="ido-verify-desc">
                                            Verify your wallet to participate in the IDO. One verification per wallet, per network.
                                        </div>
                                        <div className="ido-verify-requirements">
                                            <div className="ido-verify-req">✓ One wallet per person</div>
                                            <div className="ido-verify-req">✓ One verification per IP / network</div>
                                            <div className="ido-verify-req">✓ Captcha anti-bot protection</div>
                                        </div>
                                        <button className="ido-primary-btn ido-verify-btn" onClick={handleVerify}>
                                            VERIFY WALLET
                                        </button>
                                        <div ref={turnstileRef} style={{ display: 'none' }} />
                                    </>
                                )}

                                {verifyStep === 'submitting' && (
                                    <div className="ido-verify-loading">
                                        <div className="ido-buy-pending-spinner ido-spinner-lg" />
                                        <div className="ido-verify-title">VERIFYING...</div>
                                        <div className="ido-verify-desc">Checking captcha and sending whitelist transaction...</div>
                                    </div>
                                )}

                                {verifyStep === 'pending' && (
                                    <div className="ido-verify-loading">
                                        <div className="ido-buy-pending-spinner ido-spinner-lg" />
                                        <div className="ido-verify-title">WHITELIST TX SENT</div>
                                        <div className="ido-verify-desc">
                                            Waiting for block confirmation... This can take a few minutes.
                                        </div>
                                    </div>
                                )}

                                {verifyStep === 'verified' && (
                                    <div className="ido-verify-success">
                                        <div className="ido-verify-check">✓</div>
                                        <div className="ido-verify-title" style={{ color: '#00ff88' }}>WALLET VERIFIED!</div>
                                        <div className="ido-verify-desc">You can now participate in the $BLOCK IDO.</div>
                                    </div>
                                )}

                                {verifyStep === 'error' && (
                                    <>
                                        <div className="ido-verify-error-icon">⚠</div>
                                        <div className="ido-verify-title">VERIFICATION FAILED</div>
                                        <div className="ido-verify-error-msg">{verifyError}</div>
                                        <button className="ido-primary-btn" onClick={() => { setVerifyStep('idle'); setVerifyError(''); }}>
                                            TRY AGAIN
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {motoBalance < motoRaw && isConnected && (
                            <div className="ido-warning">Not enough MOTO</div>
                        )}

                        {nearCap && isConnected && (
                            <div className="ido-warning">Exceeds your wallet cap — max {formatBlock(userRemaining)} BLOCK remaining</div>
                        )}

                        {userRemaining === 0n && isConnected && userPurchases > 0n && (
                            <div className="ido-warning">Wallet cap reached (200,000 BLOCK)</div>
                        )}

                        {isConnected && allowanceLoaded && motoAllowance !== null && motoAllowance < motoRaw ? (
                            <>
                                <label className="ido-infinite-approval">
                                    <input
                                        type="checkbox"
                                        checked={infiniteApproval}
                                        onChange={(e) => setInfiniteApproval(e.target.checked)}
                                        disabled={loading || approvePending}
                                    />
                                    <span>Infinite approval</span>
                                    <span className="ido-infinite-hint">
                                        {infiniteApproval
                                            ? 'Unlimited MOTO allowance — revoke anytime via BlockRevoke'
                                            : 'Approves 10,000 MOTO (no re-approval needed for future buys)'}
                                    </span>
                                </label>
                                <button
                                    className="ido-primary-btn"
                                    onClick={handleApproveMoto}
                                    disabled={loading || approvePending}
                                >
                                    {loading ? 'PROCESSING...' : approvePending ? 'WAITING FOR BLOCK...' : 'APPROVE MOTO (one-time)'}
                                </button>
                                <div className="ido-mono" style={{ marginTop: 6, opacity: 0.6, fontSize: '0.8rem', textAlign: 'center' }}>
                                    {approvePending
                                        ? 'TX sent \u2014 BUY unlocks after next block'
                                        : 'Approve MOTO spend first, wait 1 block, then BUY unlocks'}
                                </div>
                            </>
                        ) : (
                            <>
                                <button
                                    className="ido-primary-btn"
                                    onClick={handleBuy}
                                    disabled={loading || buyPending || !isConnected || motoRaw <= 0n || idoNotStarted || testnetPreview || whitelistBlocked}
                                >
                                    {loading ? 'PROCESSING...' : buyPending ? 'WAITING FOR BLOCK...' : !isConnected ? 'CONNECT WALLET' : 'BUY $BLOCK'}
                                </button>
                                {buyPending && (
                                    <div className="ido-buy-pending">
                                        <div className="ido-buy-pending-spinner" />
                                        <span>Purchase pending {'\u2014'} ~{formatBlock(pendingBlockEstimate)} $BLOCK waiting for block confirmation</span>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* User purchases + wallet cap */}
            {isConnected && (userPurchases > 0n || buyPending) && (
                <div className="ido-card ido-user-card">
                    <div className="ido-section-title">YOUR PURCHASES</div>
                    <div className="ido-user-total">
                        <div className="ido-user-val">{formatBlock(userPurchases)}</div>
                        <div className="ido-user-label">$BLOCK PURCHASED</div>
                    </div>
                    {buyPending && pendingBlockEstimate > 0n && (
                        <div className="ido-pending-purchase">
                            <div className="ido-buy-pending-spinner" />
                            <span>+{formatBlock(pendingBlockEstimate)} $BLOCK pending confirmation</span>
                        </div>
                    )}
                    <div className="ido-cap-section">
                        <div className="ido-progress-header">
                            <span className="ido-mono">WALLET CAP</span>
                            <span className="ido-mono ido-orange">{userCapPct.toFixed(1)}%</span>
                        </div>
                        <div className="ido-progress-bar">
                            <div
                                className={`ido-progress-fill ${userCapPct >= 90 ? 'ido-red-fill' : 'ido-orange-fill'}`}
                                style={{ width: Math.min(userCapPct, 100) + '%' }}
                            />
                        </div>
                        <div className="ido-progress-stats">
                            <span className="ido-mono">{formatBlock(userPurchases)} USED</span>
                            <span className="ido-mono">{formatBlock(MAX_PER_USER)} MAX</span>
                        </div>
                        {userRemaining > 0n && (
                            <div className="ido-mono" style={{ marginTop: 8, fontSize: '0.78rem', opacity: 0.6, textAlign: 'center' }}>
                                {formatBlock(userRemaining)} BLOCK remaining
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Phase breakdown */}
            <div className="ido-card">
                <div className="ido-section-title">IDO PHASES</div>
                {PHASE_BREAKDOWN.map((p: PhaseBreakdown) => {
                    const isCompleted = phase > p.phase || (idoEnded && p.phase <= 3);
                    const isActive = phase === p.phase || (testnetPreview && p.phase === 1);
                    return (
                    <div className={`ido-phase-row ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`} key={p.phase}>
                        <div className="ido-phase-num">
                            {isCompleted ? '\u2713' : p.phase}
                        </div>
                        <div className="ido-phase-info">
                            <div className="ido-phase-name">PHASE {p.phase}</div>
                            <div className="ido-mono">{p.cap} $BLOCK · 1 MOTO = {p.rate} BLOCK</div>
                        </div>
                        <div className={`ido-phase-bonus ${p.bonus === 'BASE' ? 'ido-base-rate' : ''}`}>{p.bonus}</div>
                    </div>
                    );
                })}
            </div>

            {/* $BLOCK contract address */}
            <div className="ido-contract-address">
                <span className="ido-mono">$BLOCK CONTRACT</span>
                <div
                    className="ido-address-row"
                    onClick={() => {
                        navigator.clipboard.writeText(DISPLAY_ADDRESSES.BLOCK_TOKEN);
                        showToast('Address copied!', 'success');
                    }}
                    title="Click to copy"
                >
                    <span className="ido-address-hash">
                        {DISPLAY_ADDRESSES.BLOCK_TOKEN}
                    </span>
                    <svg className="ido-copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                </div>
            </div>
        </div>
    );
}
