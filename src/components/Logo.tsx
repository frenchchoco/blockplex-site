interface LogoProps {
    variant?: 'default' | 'sm' | 'hero';
}

export default function Logo({ variant }: LogoProps) {
    const className = variant ? `logo logo-${variant}` : 'logo';
    return (
        <span className={className}>
            <span className="logo-block">BLOCK</span>
            <span className="logo-sep" />
            <span className="logo-plex">plex</span>
        </span>
    );
}
