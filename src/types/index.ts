import type { AbstractRpcProvider, BitcoinInterfaceAbi } from 'opnet';
import type { Address } from '@btc-vision/transaction';

export type { AbstractRpcProvider, BitcoinInterfaceAbi } from 'opnet';
export type { Address } from '@btc-vision/transaction';

export interface ContractCallResult {
    transactionId?: string;
    hash?: string;
    properties?: Record<string, unknown>;
    events?: unknown[];
    [key: string]: unknown;
}

export interface UseOpWalletReturn {
    walletAddress: string | null;
    publicKey: string | null;
    address: Address | null;
    isConnected: boolean;
    connecting: boolean;
    network: string | null;
    provider: AbstractRpcProvider | null;
    btcBalance: bigint;
    walletType: string | null;
    connect: () => void;
    disconnect: () => void;
    getOP20Balance: (contractAddress: string, ofAddress?: string | null) => Promise<bigint>;
    callContract: (
        contractAddress: string,
        abi: BitcoinInterfaceAbi,
        method: string,
        params?: unknown[],
        satsToSend?: bigint,
        payToAddress?: string | null,
    ) => Promise<ContractCallResult>;
    readContract: (
        contractAddress: string,
        abi: BitcoinInterfaceAbi,
        method: string,
        params?: unknown[],
    ) => Promise<Record<string, unknown> | null>;
    getOP20ContractCached: (tokenAddress: string) => OP20Contract | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OP20Contract = Record<string, any> & {
    allowance: (owner: Address, spender: Address) => Promise<{ properties: { remaining: bigint } }>;
    increaseAllowance: (spender: Address, amount: bigint) => Promise<{ sendTransaction: (params: SendTransactionParams) => Promise<unknown> }>;
    balanceOf: (owner: Address) => Promise<{ properties: { balance: bigint } }>;
    setSender: (sender: Address) => void;
};

export interface SendTransactionParams {
    signer: null;
    mldsaSigner: null;
    refundTo: string;
    maximumAllowedSatToSpend: bigint;
    network: unknown;
    extraOutputs?: { address: string; value: number }[];
}

export type ToastType = 'info' | 'success' | 'error' | 'warning';
export type ShowToast = (message: string, type: ToastType) => void;
