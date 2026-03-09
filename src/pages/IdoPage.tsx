import { useState, useCallback } from 'react';
import { useOpWallet } from '../hooks/useOpWallet';
import { formatSats } from '../config/contracts';
import { NETWORK_NAME } from '../config/contracts';
import IdoTab from '../components/ido/IdoTab';
import type { ToastType } from '../types';

interface ToastState {
    msg: string;
    type: ToastType;
}

const shortAddr = (a: string | null): string =>
    a ? a.slice(0, 6) + '...' + a.slice(-4) : '';

export default function IdoPage() {
    const {
        walletAddress, address, isConnected, btcBalance,
        connect, disconnect, getOP20Balance,
        callContract, readContract,
        provider, getOP20ContractCached,
        network: walletNetwork,
    } = useOpWallet();

    // Effective network: use wallet's live network when connected, fall back to build-time config
    const effectiveNetwork: string = (isConnected && walletNetwork) ? walletNetwork : NETWORK_NAME;
    const networkMismatch: boolean = isConnected && !!walletNetwork && walletNetwork !== NETWORK_NAME;

    const [toast, setToast] = useState<ToastState | null>(null);

    const showToast = useCallback((msg: string, type: ToastType = 'info'): void => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    return (
        <div className="container" style={{ paddingTop: 100, minHeight: '100vh' }}>
            {toast && (
                <div className={`ido-toast ${toast.type}`}>{toast.msg}</div>
            )}

            {/* IDO Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div className="section-label">Initial DEX Offering</div>
                    <h2 className="section-title" style={{ marginBottom: 0 }}>$BLOCK IDO</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {effectiveNetwork !== 'mainnet' && (
                        <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            background: 'rgba(155,91,255,0.15)',
                            color: 'var(--accent-violet)',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: '1px solid rgba(155,91,255,0.2)',
                        }}>{(effectiveNetwork || 'TESTNET').toUpperCase()}</span>
                    )}
                    {isConnected && (
                        <span style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            fontFamily: 'var(--font-body)',
                        }}>
                            {formatSats(btcBalance)}
                        </span>
                    )}
                    {isConnected ? (
                        <button className="btn-ghost" style={{ padding: '10px 20px', fontSize: '0.8rem' }} onClick={disconnect}>
                            {shortAddr(walletAddress)}
                        </button>
                    ) : (
                        <button className="btn-primary" style={{ padding: '10px 24px', fontSize: '0.85rem' }} onClick={connect}>
                            Connect Wallet
                        </button>
                    )}
                </div>
            </div>

            {networkMismatch && (
                <div className="ido-mainnet-notice" style={{ borderColor: 'rgba(255,150,50,0.4)', background: 'rgba(255,150,50,0.08)' }}>
                    <div className="ido-mainnet-icon">⚠️</div>
                    <div className="ido-mainnet-body">
                        <div className="ido-mainnet-title">Network Mismatch</div>
                        <div className="ido-mainnet-desc">
                            Your wallet is on <strong>{walletNetwork}</strong> but this site is configured for <strong>{NETWORK_NAME}</strong>. Switch your wallet to <strong>{NETWORK_NAME}</strong> for transactions to work.
                        </div>
                    </div>
                </div>
            )}

            {effectiveNetwork === 'mainnet' ? (
                <div className="ido-mainnet-notice">
                    <div className="ido-mainnet-icon">🚀</div>
                    <div className="ido-mainnet-body">
                        <div className="ido-mainnet-title">Mainnet IDO launches March 17, 2026</div>
                        <div className="ido-mainnet-desc">
                            The $BLOCK Initial DEX Offering goes live on Bitcoin mainnet. Early buyers get up to <strong>+50% bonus</strong> in Phase 1.
                        </div>
                    </div>
                </div>
            ) : (
                <div className="ido-mainnet-notice" style={{ borderColor: 'rgba(155,91,255,0.3)', background: 'rgba(155,91,255,0.06)' }}>
                    <div className="ido-mainnet-icon">🧪</div>
                    <div className="ido-mainnet-body">
                        <div className="ido-mainnet-title">Testnet Preview</div>
                        <div className="ido-mainnet-desc">
                            You are on testnet. Buy $BLOCK with testnet MOTO to try the IDO flow. Mainnet launches <strong>March 17, 2026</strong>.
                        </div>
                    </div>
                </div>
            )}

            <IdoTab
                key={walletAddress ?? 'no-wallet'}
                walletAddress={walletAddress}
                address={address}
                isConnected={isConnected}
                provider={provider}
                showToast={showToast}
                callContract={callContract}
                readContract={readContract}
                getOP20Balance={getOP20Balance}
                getOP20ContractCached={getOP20ContractCached}
                onBalanceRefresh={() => {}}
                effectiveNetwork={effectiveNetwork}
            />
        </div>
    );
}
