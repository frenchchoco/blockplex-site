import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import Logo from './Logo';

export default function Hero() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const heroRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const canvasEl = canvasRef.current;
        const heroEl = heroRef.current;
        if (!canvasEl || !heroEl) return;
        // Non-null aliases for closures
        const canvas = canvasEl;
        const hero = heroEl;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        camera.position.set(0, 1.8, 4.5);
        camera.lookAt(0, 0, 0);

        const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

        // Galaxy parameters
        const ARMS = 5;
        const PARTICLES = 12000;
        const RADIUS = 5.5;
        const BRANCH_SPREAD = 0.7;
        const SPIN = 1.8;
        const CORE_PARTICLES = 3000;

        const colOrange = new THREE.Color('#f7931a');
        const colViolet = new THREE.Color('#9b5bff');
        const colCyan = new THREE.Color('#00e5ff');
        const colPink = new THREE.Color('#ff3c8e');
        const colWhite = new THREE.Color('#c8c4d8');
        const armColors = [colOrange, colViolet, colCyan, colPink, colWhite];

        // Galaxy spiral arms
        const galaxyGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(PARTICLES * 3);
        const colors = new Float32Array(PARTICLES * 3);
        const sizes = new Float32Array(PARTICLES);
        const randoms = new Float32Array(PARTICLES);

        for (let i = 0; i < PARTICLES; i++) {
            const i3 = i * 3;
            const armIndex = i % ARMS;
            const armAngle = (armIndex / ARMS) * Math.PI * 2;
            const radius = Math.pow(Math.random(), 1.5) * RADIUS;
            const spinAngle = radius * SPIN;

            const spreadX = (Math.random() - 0.5) * BRANCH_SPREAD * (radius / RADIUS + 0.2);
            const spreadY = (Math.random() - 0.5) * BRANCH_SPREAD * 0.4 * (1 - radius / RADIUS);
            const spreadZ = (Math.random() - 0.5) * BRANCH_SPREAD * (radius / RADIUS + 0.2);

            positions[i3] = Math.cos(armAngle + spinAngle) * radius + spreadX;
            positions[i3 + 1] = spreadY;
            positions[i3 + 2] = Math.sin(armAngle + spinAngle) * radius + spreadZ;

            const armCol = armColors[armIndex];
            const edgeMix = Math.pow(radius / RADIUS, 1.5);
            const mixCol = armCol.clone().lerp(colWhite, edgeMix * 0.6);

            colors[i3] = mixCol.r;
            colors[i3 + 1] = mixCol.g;
            colors[i3 + 2] = mixCol.b;

            sizes[i] = (Math.random() * 0.6 + 0.3) * (1 - (radius / RADIUS) * 0.5);
            randoms[i] = Math.random() * Math.PI * 2;
        }

        galaxyGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        galaxyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        galaxyGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        galaxyGeo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

        const galaxyMat = new THREE.ShaderMaterial({
            vertexShader: `
                attribute float size;
                attribute float aRandom;
                varying vec3 vColor;
                varying float vAlpha;
                uniform float uTime;
                uniform float uPixelRatio;
                void main() {
                    vColor = color;
                    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                    float pulse = sin(uTime * 0.8 + aRandom * 6.28) * 0.3 + 0.7;
                    gl_PointSize = size * uPixelRatio * 28.0 * pulse * (1.0 / -mvPos.z);
                    gl_Position = projectionMatrix * mvPos;
                    vAlpha = pulse * (1.0 / (-mvPos.z * 0.3 + 0.5));
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5);
                    if (d > 0.5) discard;
                    float glow = exp(-d * 6.0);
                    float core = smoothstep(0.15, 0.0, d);
                    vec3 col = vColor * glow + vec3(1.0) * core * 0.5;
                    float alpha = clamp(vAlpha * glow * 1.2, 0.0, 1.0);
                    gl_FragColor = vec4(col, alpha);
                }
            `,
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
            },
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        const galaxy = new THREE.Points(galaxyGeo, galaxyMat);
        galaxy.rotation.x = -0.45;
        scene.add(galaxy);

        // Core glow
        const coreGeo = new THREE.BufferGeometry();
        const corePos = new Float32Array(CORE_PARTICLES * 3);
        const coreCol = new Float32Array(CORE_PARTICLES * 3);
        const coreSiz = new Float32Array(CORE_PARTICLES);
        const coreRnd = new Float32Array(CORE_PARTICLES);

        for (let i = 0; i < CORE_PARTICLES; i++) {
            const i3 = i * 3;
            const r = Math.pow(Math.random(), 2) * 0.8;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI * 0.6;
            corePos[i3] = Math.cos(theta) * Math.cos(phi) * r;
            corePos[i3 + 1] = Math.sin(phi) * r * 0.3;
            corePos[i3 + 2] = Math.sin(theta) * Math.cos(phi) * r;

            const cMix = Math.random();
            const cc = colOrange.clone().lerp(colWhite, cMix * 0.7);
            coreCol[i3] = cc.r;
            coreCol[i3 + 1] = cc.g;
            coreCol[i3 + 2] = cc.b;
            coreSiz[i] = Math.random() * 0.5 + 0.5;
            coreRnd[i] = Math.random() * Math.PI * 2;
        }

        coreGeo.setAttribute('position', new THREE.BufferAttribute(corePos, 3));
        coreGeo.setAttribute('color', new THREE.BufferAttribute(coreCol, 3));
        coreGeo.setAttribute('size', new THREE.BufferAttribute(coreSiz, 1));
        coreGeo.setAttribute('aRandom', new THREE.BufferAttribute(coreRnd, 1));

        const coreMat = galaxyMat.clone();
        coreMat.uniforms = {
            uTime: galaxyMat.uniforms.uTime,
            uPixelRatio: galaxyMat.uniforms.uPixelRatio,
        };
        const core = new THREE.Points(coreGeo, coreMat);
        core.rotation.x = -0.45;
        scene.add(core);

        // Floating dust
        const dustCount = 800;
        const dustGeo = new THREE.BufferGeometry();
        const dustPos = new Float32Array(dustCount * 3);
        const dustCol = new Float32Array(dustCount * 3);
        const dustSiz = new Float32Array(dustCount);
        const dustRnd = new Float32Array(dustCount);

        for (let i = 0; i < dustCount; i++) {
            const i3 = i * 3;
            dustPos[i3] = (Math.random() - 0.5) * 20;
            dustPos[i3 + 1] = (Math.random() - 0.5) * 12;
            dustPos[i3 + 2] = (Math.random() - 0.5) * 15 - 3;
            const dc = colWhite.clone().lerp(colCyan, Math.random() * 0.3);
            dustCol[i3] = dc.r;
            dustCol[i3 + 1] = dc.g;
            dustCol[i3 + 2] = dc.b;
            dustSiz[i] = Math.random() * 0.15 + 0.05;
            dustRnd[i] = Math.random() * Math.PI * 2;
        }

        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
        dustGeo.setAttribute('size', new THREE.BufferAttribute(dustSiz, 1));
        dustGeo.setAttribute('aRandom', new THREE.BufferAttribute(dustRnd, 1));

        const dustMat = galaxyMat.clone();
        dustMat.uniforms = {
            uTime: galaxyMat.uniforms.uTime,
            uPixelRatio: galaxyMat.uniforms.uPixelRatio,
        };
        const dust = new THREE.Points(dustGeo, dustMat);
        scene.add(dust);

        // Mouse tracking
        function onMouseMove(e: MouseEvent) {
            mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
            mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
        }
        window.addEventListener('mousemove', onMouseMove);

        // Resize
        function resize() {
            const w = hero.offsetWidth;
            const h = hero.offsetHeight;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        }
        resize();
        window.addEventListener('resize', resize);

        // Scroll fade
        function onScroll() {
            const rect = hero.getBoundingClientRect();
            const progress = Math.max(0, Math.min(1, -rect.top / rect.height));
            canvas.style.opacity = String(1 - progress * 1.5);
        }
        window.addEventListener('scroll', onScroll);

        // Animate
        const clock = new THREE.Clock();
        let animationId: number;

        function animate() {
            animationId = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();
            galaxyMat.uniforms.uTime.value = t;

            mouse.x += (mouse.tx - mouse.x) * 0.03;
            mouse.y += (mouse.ty - mouse.y) * 0.03;

            galaxy.rotation.y = t * 0.04 + mouse.x * 0.15;
            galaxy.rotation.x = -0.45 + mouse.y * 0.08;
            core.rotation.y = galaxy.rotation.y;
            core.rotation.x = galaxy.rotation.x;

            dust.rotation.y = t * 0.008;
            dust.rotation.x = mouse.y * 0.04;

            renderer.render(scene, camera);
        }
        animate();

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('resize', resize);
            window.removeEventListener('scroll', onScroll);
            renderer.dispose();
            galaxyGeo.dispose();
            galaxyMat.dispose();
            coreGeo.dispose();
            coreMat.dispose();
            dustGeo.dispose();
            dustMat.dispose();
        };
    }, []);

    return (
        <section className="hero" ref={heroRef}>
            <canvas id="galaxy-canvas" ref={canvasRef} />
            <div className="hero-content">
                <div className="hero-tag">Built on Bitcoin Layer 1</div>
                <h1>
                    The <Logo variant="hero" /> Ecosystem
                </h1>
                <p className="hero-sub">
                    A suite of decentralized applications built on OP_NET.
                    Vesting, lottery, tips, billing, approvals — fully on-chain, fully transparent.
                </p>
                <Link to="/ido" className="ido-launch-banner">
                    <span className="ido-launch-live">MAINNET LAUNCH</span>
                    <span className="ido-launch-date">March 17, 2026</span>
                    <span className="ido-launch-cta">Get $BLOCK at up to +50% bonus →</span>
                </Link>
                <div className="hero-actions">
                    <Link to="/ido" className="btn-primary btn-ido">$BLOCK IDO — Buy Now</Link>
                    <a href="#dapps" className="btn-ghost">Explore the dApps</a>
                </div>
            </div>
        </section>
    );
}
