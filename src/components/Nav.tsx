import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';

export default function Nav() {
    const navRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const nav = navRef.current;
        if (!nav) return;

        function onScroll() {
            if (!nav) return;
            nav.style.background =
                window.scrollY > 60
                    ? 'rgba(6,5,14,0.92)'
                    : 'rgba(6,5,14,0.7)';
        }

        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <nav ref={navRef}>
            <div className="container">
                <Link to="/" style={{ textDecoration: 'none' }}><Logo /></Link>
                <ul className="nav-links">
                    <li><a href="/#dapps">dApps</a></li>
                    <li><Link to="/ido">IDO</Link></li>
                    <li><a href="/#about">About</a></li>
                    <li><span className="nav-badge">OP_NET &bull; Bitcoin L1</span></li>
                </ul>
            </div>
        </nav>
    );
}
