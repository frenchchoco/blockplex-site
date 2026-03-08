import Logo from './Logo';

export default function Footer() {
    return (
        <footer>
            <div className="container">
                <div className="footer-inner">
                    <div className="footer-left">
                        <Logo variant="sm" />
                        <p>&copy; 2026 BlockPlex. Built on Bitcoin with OP_NET.</p>
                    </div>
                    <div className="footer-right">
                        <a href="https://github.com/frenchchoco" target="_blank" rel="noopener">GitHub</a>
                        <a href="https://x.com/frenchchoco" target="_blank" rel="noopener">{'\ud835\udd4f'} Twitter</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
