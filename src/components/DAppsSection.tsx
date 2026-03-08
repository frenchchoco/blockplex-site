import { Link } from 'react-router-dom';
import { useScrollReveal } from '../hooks/useScrollReveal';

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
    const ref = useScrollReveal<HTMLDivElement>();
    return (
        <div ref={ref} className={`reveal ${className ?? ''}`}>
            {children}
        </div>
    );
}

const ArrowIcon = () => (
    <svg viewBox="0 0 24 24">
        <path d="M7 17L17 7M17 7H7M17 7v10" />
    </svg>
);

interface DAppCardProps {
    variant: string;
    icon: string;
    name: string;
    tag: string;
    description: string;
    features: string[];
    href: string;
}

function DAppCard({ variant, icon, name, tag, description, features, href }: DAppCardProps) {
    return (
        <Reveal className={`dapp-card ${variant}`}>
            <div className="dapp-icon">{icon}</div>
            <h3>{name}</h3>
            <span className="dapp-tag">{tag}</span>
            <p>{description}</p>
            <div className="dapp-features">
                {features.map((f) => (
                    <span key={f} className="dapp-feature">{f}</span>
                ))}
            </div>
            <a href={href} className="dapp-link" target="_blank" rel="noopener">
                Launch App <ArrowIcon />
            </a>
        </Reveal>
    );
}

const dappsRow1: DAppCardProps[] = [
    {
        variant: 'rite',
        icon: '\ud83d\udd12',
        name: 'BlockRite',
        tag: 'Token Vesting',
        description:
            'Token vesting platform for OP_20 tokens with cliff periods, linear vesting, multi-beneficiary management, and LP token locking.',
        features: ['Cliff & Linear', 'Multi-beneficiary', 'LP Lock'],
        href: 'https://blockrite.xyz',
    },
    {
        variant: 'lottery',
        icon: '\ud83c\udfb0',
        name: 'BlockLottery',
        tag: 'Lottery',
        description:
            'Decentralized lottery system powered by three smart contracts: BlockToken, BlockSale, and BlockLottery. Transparent and verifiable draws.',
        features: ['3 Contracts', 'Provably Fair', 'Token Sale'],
        href: 'https://blocklottery.org',
    },
    {
        variant: 'tip',
        icon: '\ud83d\udcb8',
        name: 'BlockTip',
        tag: 'Tips & Donations',
        description:
            'Send tips in OP_20 tokens directly on-chain. Simple, fast, no middleman. Perfect for creators and communities.',
        features: ['Instant Tips', 'OP_20 Native', 'No Middleman'],
        href: 'https://blocktip.vercel.app',
    },
];

const dappsRow2: DAppCardProps[] = [
    {
        variant: 'bill',
        icon: '\ud83d\udcc4',
        name: 'BlockBill',
        tag: 'Billing & Invoicing',
        description:
            'Decentralized billing and recurring payments on Bitcoin. Create, send, and track your invoices directly on-chain.',
        features: ['Recurring', 'Invoice Tracking', 'On-chain Proof'],
        href: 'https://blockbill-eight.vercel.app',
    },
    {
        variant: 'revoke',
        icon: '\ud83d\udee1\ufe0f',
        name: 'BlockRevoke',
        tag: 'Security & Approvals',
        description:
            'Manage and revoke your token approvals on OP_NET. Visualize all active authorizations and protect your funds.',
        features: ['Approval Scanner', 'One-click Revoke', 'Wallet Security'],
        href: 'https://blockrevoke.com',
    },
];

export default function DAppsSection() {
    return (
        <section className="dapps-section" id="dapps">
            <div className="container">
                <Reveal className="dapps-header">
                    <div className="section-label">Ecosystem</div>
                    <h2 className="section-title">Five dApps. One token. One ecosystem.</h2>
                    <p className="section-desc">
                        Every Block application is powered by $BLOCK, the native OP_20 token
                        that unifies the ecosystem — from vesting to lottery to tips.
                    </p>
                </Reveal>

                <Reveal className="token-banner">
                    <div className="token-inner">
                        <div className="token-glyph">$B</div>
                        <div className="token-text">
                            <h3>The <span>$BLOCK</span> token</h3>
                            <p>
                                $BLOCK is the native OP_20 token at the heart of every BlockPlex dApp.
                                It serves as the utility and governance token across the entire ecosystem —
                                used for vesting schedules, lottery entries, tipping, invoice payments, and approval management.
                                One token, endless possibilities.
                            </p>
                            <div className="token-pills">
                                <span className="token-pill">OP_20 Standard</span>
                                <span className="token-pill">Utility Token</span>
                                <span className="token-pill">Cross-dApp</span>
                                <span className="token-pill">Bitcoin L1</span>
                            </div>
                        </div>
                    </div>
                </Reveal>

                <Reveal className="token-banner">
                    <Link to="/ido" className="token-inner" style={{ textDecoration: 'none', cursor: 'pointer', marginTop: 0 }}>
                        <div className="token-glyph">IDO</div>
                        <div className="token-text">
                            <h3><span>$BLOCK</span> Initial DEX Offering</h3>
                            <p>
                                Buy $BLOCK with $MOTO at a bonus rate. Three phases, decreasing bonuses —
                                the earlier you buy, the more you get. Up to +50% bonus in Phase 1.
                            </p>
                            <div className="token-pills">
                                <span className="token-pill">Phase 1: +50%</span>
                                <span className="token-pill">Phase 2: +25%</span>
                                <span className="token-pill">Phase 3: +10%</span>
                            </div>
                        </div>
                        <svg viewBox="0 0 24 24" style={{ width: 28, height: 28, stroke: 'var(--accent-orange)', strokeWidth: 2, fill: 'none', flexShrink: 0 }}>
                            <path d="M7 17L17 7M17 7H7M17 7v10" />
                        </svg>
                    </Link>
                </Reveal>

                <div className="dapps-grid" style={{ marginTop: 48 }}>
                    {dappsRow1.map((dapp) => (
                        <DAppCard key={dapp.name} {...dapp} />
                    ))}
                </div>

                <div className="dapps-grid-row2">
                    {dappsRow2.map((dapp) => (
                        <DAppCard key={dapp.name} {...dapp} />
                    ))}
                </div>
            </div>
        </section>
    );
}
