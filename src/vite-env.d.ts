/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_NETWORK: 'testnet' | 'mainnet';
    readonly VITE_BLOCK_TOKEN: string;
    readonly VITE_BLOCK_IDO: string;
    readonly VITE_MOTO_TOKEN: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
