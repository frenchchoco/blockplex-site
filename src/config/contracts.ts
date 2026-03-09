import { ABIDataTypes } from '@btc-vision/transaction';
import { BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

// ─── Network from env ────────────────────────────────────────
export type NetworkName = 'testnet' | 'mainnet';

export const NETWORK_NAME: NetworkName =
    (import.meta.env.VITE_NETWORK as NetworkName) || 'testnet';

// ─── Per-network contract addresses ──────────────────────────
interface ContractAddresses {
    BLOCK_TOKEN: string;
    BLOCK_IDO: string;
    MOTO_TOKEN: string;
}

const TESTNET_CONTRACTS: ContractAddresses = {
    BLOCK_TOKEN: '0x8446a68241647a7867ad3ed5d2220590f24fb0767335f5044f4ac1a87aaf0c6a',
    BLOCK_IDO: '0x2e4a08481bc393f8d0ededbea8c94d90332412c123b909cc45a4aee1242d9cee',
    MOTO_TOKEN: '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd',
};

const MAINNET_CONTRACTS: ContractAddresses = {
    BLOCK_TOKEN: import.meta.env.VITE_BLOCK_TOKEN || '',
    BLOCK_IDO: import.meta.env.VITE_BLOCK_IDO || '',
    MOTO_TOKEN: import.meta.env.VITE_MOTO_TOKEN || '',
};

export const CONTRACTS: ContractAddresses =
    NETWORK_NAME === 'mainnet' ? MAINNET_CONTRACTS : TESTNET_CONTRACTS;

// ─── Human-readable opt1 addresses (for display) ────────────
interface DisplayAddresses {
    BLOCK_TOKEN: string;
}

const TESTNET_DISPLAY: DisplayAddresses = {
    BLOCK_TOKEN: 'opt1sqrzm2tgmnxcap43ggza82238js8p3uwphqskpsal',
};

const MAINNET_DISPLAY: DisplayAddresses = {
    BLOCK_TOKEN: import.meta.env.VITE_BLOCK_TOKEN_OPT1 || '',
};

export const DISPLAY_ADDRESSES: DisplayAddresses =
    NETWORK_NAME === 'mainnet' ? MAINNET_DISPLAY : TESTNET_DISPLAY;

// Validate addresses at startup
const HEX_RE = /^0x[0-9a-f]{64}$/;
for (const [name, addr] of Object.entries(CONTRACTS)) {
    if (addr && !HEX_RE.test(addr)) {
        console.error(`Invalid contract address for ${name}: ${addr}`);
    }
}

// ─── BlockIDO ABI ────────────────────────────────────────────
export const BLOCK_IDO_ABI: BitcoinInterfaceAbi = [
    {
        name: 'buy',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'motoAmount', type: ABIDataTypes.UINT256 }],
        outputs: [
            { name: 'blockReceived', type: ABIDataTypes.UINT256 },
            { name: 'phase', type: ABIDataTypes.UINT256 },
            { name: 'totalSold', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getIDOInfo',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'phase', type: ABIDataTypes.UINT256 },
            { name: 'totalSold', type: ABIDataTypes.UINT256 },
            { name: 'phaseSold', type: ABIDataTypes.UINT256 },
            { name: 'phaseCap', type: ABIDataTypes.UINT256 },
            { name: 'bonusBps', type: ABIDataTypes.UINT256 },
            { name: 'totalMotoRaised', type: ABIDataTypes.UINT256 },
            { name: 'blockPerMoto', type: ABIDataTypes.UINT256 },
            { name: 'paused', type: ABIDataTypes.BOOL },
            { name: 'whitelistEnabled', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'getUserPurchases',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'user', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'totalBlock', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'loadBlock',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'withdrawMoto',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'withdrawBlock',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'setPaused',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'paused', type: ABIDataTypes.BOOL }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'isWhitelisted',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'user', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'whitelisted', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'setWhitelistEnabled',
        type: BitcoinAbiTypes.Function,
        inputs: [{ name: 'enabled', type: ABIDataTypes.BOOL }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'setWhitelist',
        type: BitcoinAbiTypes.Function,
        inputs: [
            { name: 'user', type: ABIDataTypes.ADDRESS },
            { name: 'allowed', type: ABIDataTypes.BOOL },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
];

// ─── Token config ────────────────────────────────────────────
export const BLOCK_DECIMALS = 8;
export const BLOCK_UNITS = 100_000_000n;
export const MOTO_DECIMALS = 18;
export const MOTO_UNITS = 1_000_000_000_000_000_000n;

// ─── Formatters ──────────────────────────────────────────────
export const formatBlock = (units: bigint): string => {
    if (units === 0n) return '0';
    const whole = units / BLOCK_UNITS;
    const frac = units % BLOCK_UNITS;
    if (frac === 0n) return whole.toLocaleString();
    const fracStr = frac.toString().padStart(8, '0').slice(0, 4).replace(/0+$/, '');
    if (!fracStr) return whole.toLocaleString();
    return `${whole.toLocaleString()}.${fracStr}`;
};

export const formatMoto = (units: bigint): string => {
    if (units === 0n) return '0';
    const whole = units / MOTO_UNITS;
    const frac = units % MOTO_UNITS;
    if (frac === 0n) return whole.toLocaleString();
    const fracStr = frac.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
    if (!fracStr) return whole.toLocaleString();
    return `${whole.toLocaleString()}.${fracStr}`;
};

export const formatSats = (sats: bigint | number): string => {
    const s = typeof sats === 'bigint' ? sats : BigInt(sats);
    if (s >= 100_000_000n) {
        const whole = s / 100_000_000n;
        const frac = s % 100_000_000n;
        const fracStr = frac.toString().padStart(8, '0').slice(0, 4);
        return `${whole}.${fracStr} BTC`;
    }
    if (s >= 1_000_000n) {
        const whole = s / 1_000_000n;
        const frac = ((s % 1_000_000n) * 100n) / 1_000_000n;
        return `${whole}.${frac.toString().padStart(2, '0')}M sats`;
    }
    if (s >= 1_000n) {
        const whole = s / 1_000n;
        const frac = ((s % 1_000n) * 10n) / 1_000n;
        return `${whole}.${frac}K sats`;
    }
    return `${s} sats`;
};
