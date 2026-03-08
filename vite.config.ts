import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    base: '/',
    plugins: [
        nodePolyfills({
            globals: { Buffer: true, global: true, process: true },
        }),
        react(),
    ],
    resolve: {
        alias: {
            '@noble/hashes/sha256': '@noble/hashes/sha2.js',
            '@noble/hashes/sha512': '@noble/hashes/sha2.js',
            '@noble/hashes/ripemd160': '@noble/hashes/legacy.js',
        },
        dedupe: ['@noble/curves', '@noble/hashes', 'buffer', 'react', 'react-dom'],
    },
    server: { port: 3000 },
    esbuild: {
        drop: ['console', 'debugger'],
    },
    build: {
        target: 'esnext',
        rollupOptions: {
            output: {
                manualChunks: {
                    crypto: ['@noble/curves', '@noble/hashes'],
                    btcvision: ['@btc-vision/transaction', '@btc-vision/bitcoin'],
                    opnet: ['opnet'],
                    react: ['react', 'react-dom'],
                },
            },
            external: ['worker_threads'],
        },
        chunkSizeWarningLimit: 3000,
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'buffer', 'process'],
    },
});
