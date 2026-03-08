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
    } = useOpWallet();

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
                    {NETWORK_NAME === 'testnet' && (
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
                        }}>TESTNET</span>
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

            {NETWORK_NAME === 'mainnet' ? (
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
            />
        </div>
    );
}
