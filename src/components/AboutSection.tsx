import { useScrollReveal } from '../hooks/useScrollReveal';

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
    const ref = useScrollReveal<HTMLDivElement>();
    return (
        <div ref={ref} className={`reveal ${className ?? ''}`}>
            {children}
        </div>
    );
}

function Orrery() {
    return (
        <div className="orrery">
            <div className="orbit-ring"><div className="orbit-dot" /></div>
            <div className="orbit-ring"><div className="orbit-dot" /></div>
            <div className="orbit-ring"><div className="orbit-dot" /></div>
            <div className="orbit-ring"><div className="orbit-dot" /></div>
            <div className="orbit-ring"><div className="orbit-dot" /></div>
            <div className="orbit-center">
                <span className="logo-block">BLOCK</span>
                <span className="logo-divider" />
                <span className="logo-plex">plex</span>
            </div>
        </div>
    );
}

export default function AboutSection() {
    return (
        <section className="about-section" id="about">
            <div className="container">
                <div className="about-grid">
                    <Reveal className="about-visual">
                        <Orrery />
                    </Reveal>
                    <Reveal className="about-text">
                        <div className="section-label">About</div>
                        <h2 className="section-title">
                            Native DeFi on <span>Bitcoin</span>
                        </h2>
                        <p>
                            BlockPlex was born from a simple conviction: Bitcoin deserves its own ecosystem of
                            decentralized applications, with no compromise on decentralization.
                        </p>
                        <p>
                            Built on OP_NET, every dApp in the Block ecosystem interacts
                            directly with smart contracts deployed on Bitcoin Layer 1.
                            No bridges, no intermediate layers — just code and the blockchain.
                        </p>
                        <p>
                            Developed by <strong>frenchchoco</strong>, active contributor to the OP_NET ecosystem
                            and Bitcoin enthusiast since block one.
                        </p>
                        <div className="about-stats">
                            <div className="stat-item">
                                <div className="stat-number">5</div>
                                <div className="stat-label">dApps</div>
                            </div>
                            <div className="stat-item">
                                <div className="stat-number">L1</div>
                                <div className="stat-label">Bitcoin Native</div>
                            </div>
                            <div className="stat-item">
                                <div className="stat-number">100%</div>
                                <div className="stat-label">On-chain</div>
                            </div>
                        </div>
                    </Reveal>
                </div>
            </div>
        </section>
    );
}
