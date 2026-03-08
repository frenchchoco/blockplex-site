import { useWalletConnect } from '@btc-vision/walletconnect';
import { getContract, OP_20_ABI, TransactionOutputFlags } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { useCallback, useEffect, useRef } from 'react';
import type { Address } from '@btc-vision/transaction';
import type { UseOpWalletReturn, ContractCallResult, OP20Contract, SendTransactionParams } from '../types';
import { friendlyWalletError } from '../utils/walletErrors';
import { NETWORK_NAME } from '../config/contracts';

const NETWORK = NETWORK_NAME === 'mainnet' ? networks.bitcoin : networks.opnetTestnet;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const contractCache = new Map<string, any>();
const publicKeyInfoCache = new Map<string, Address>();
const rpcLastCall = new Map<string, number>();
const RPC_MIN_INTERVAL_MS = 2_000;
const readCache = new Map<string, { data: Record<string, unknown>; ts: number }>();
const READ_CACHE_TTL_MS = 3_000;

function getCachedContract(
    contractAddress: string,
    abi: BitcoinInterfaceAbi,
    provider: unknown,
    sender: Address | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    const key = contractAddress;
    if (!contractCache.has(key)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contract = getContract(contractAddress, abi, provider as any, NETWORK, sender ?? undefined);
        contractCache.set(key, contract);
    }
    const cached = contractCache.get(key);
    if (sender) cached.setSender(sender);
    return cached;
}

export const useOpWallet = (): UseOpWalletReturn => {
    const {
        openConnectModal,
        disconnect,
        walletAddress,
        publicKey,
        address,
        connecting,
        provider,
        walletBalance,
        walletType,
        network,
    } = useWalletConnect();

    const isConnected = !!walletAddress;
    const btcBalance = BigInt(walletBalance?.total ?? 0);

    const prevAddrRef = useRef<string | null>(null);
    useEffect(() => {
        if (walletAddress === prevAddrRef.current) return;
        prevAddrRef.current = walletAddress;
        contractCache.clear();
        publicKeyInfoCache.clear();
        readCache.clear();
        rpcLastCall.clear();
    }, [walletAddress]);

    const getOP20Balance = useCallback(async (contractAddress: string, ofAddress: string | null = null): Promise<bigint> => {
        if (!provider || !address) return 0n;
        try {
            const contract = getCachedContract(contractAddress, OP_20_ABI, provider, address);
            let target: Address = address;
            if (ofAddress) {
                if (publicKeyInfoCache.has(ofAddress)) {
                    target = publicKeyInfoCache.get(ofAddress)!;
                } else {
                    const resolved = await provider.getPublicKeyInfo(ofAddress, true);
                    if (!resolved) return 0n;
                    target = resolved;
                    publicKeyInfoCache.set(ofAddress, target);
                }
            }
            const result = await contract.balanceOf(target);
            return BigInt(result.properties.balance ?? 0);
        } catch (e) {
            console.error('getOP20Balance error:', e);
            return 0n;
        }
    }, [provider, address]);

    const callContract = useCallback(async (
        contractAddress: string,
        abi: BitcoinInterfaceAbi,
        method: string,
        params: unknown[] = [],
        satsToSend: bigint = 0n,
        payToAddress: string | null = null,
    ): Promise<ContractCallResult> => {
        if (!address || !provider) throw new Error('Wallet not connected');

        const contract = getCachedContract(contractAddress, abi, provider, address);
        const satsDest = payToAddress || contractAddress;

        if (satsToSend > 0n) {
            contract.setTransactionDetails({
                inputs: [],
                outputs: [{
                    to: satsDest,
                    value: satsToSend,
                    index: 1,
                    scriptPubKey: undefined,
                    flags: TransactionOutputFlags.hasTo,
                }],
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let sim: any;
        try {
            sim = await contract[method](...params);
        } catch (simErr: unknown) {
            throw new Error('Simulation failed: ' + friendlyWalletError(simErr));
        }

        const sendParams: SendTransactionParams = {
            signer: null,
            mldsaSigner: null,
            refundTo: walletAddress!,
            maximumAllowedSatToSpend: satsToSend > 0n ? satsToSend + 50_000n : 50_000n,
            network: NETWORK,
        };

        if (satsToSend > 0n) {
            sendParams.extraOutputs = [
                { address: satsDest, value: Number(satsToSend) },
            ];
        }

        let tx;
        try {
            tx = await sim.sendTransaction(sendParams);
        } catch (txErr: unknown) {
            throw new Error(friendlyWalletError(txErr));
        }
        return { ...tx, properties: sim.properties, events: sim.events };
    }, [address, provider, walletAddress]);

    const readContract = useCallback(async (
        contractAddress: string,
        abi: BitcoinInterfaceAbi,
        method: string,
        params: unknown[] = [],
    ): Promise<Record<string, unknown> | null> => {
        if (!provider) return null;

        const cacheKey = `${contractAddress}:${method}:${JSON.stringify(params)}`;
        const now = Date.now();
        const lastCall = rpcLastCall.get(cacheKey) ?? 0;
        const cached = readCache.get(cacheKey);

        if (now - lastCall < RPC_MIN_INTERVAL_MS && cached && now - cached.ts < READ_CACHE_TTL_MS) {
            return cached.data;
        }
        rpcLastCall.set(cacheKey, now);

        try {
            const contract = getCachedContract(contractAddress, abi, provider, address);
            const result = await contract[method](...params);
            const data = result.properties as Record<string, unknown>;
            readCache.set(cacheKey, { data, ts: Date.now() });
            return data;
        } catch (e) {
            console.error('readContract:', e);
            return null;
        }
    }, [provider, address]);

    const getOP20ContractCached = useCallback((tokenAddress: string): OP20Contract | null => {
        if (!provider || !address) return null;
        return getCachedContract(tokenAddress, OP_20_ABI, provider, address);
    }, [provider, address]);

    return {
        walletAddress,
        publicKey,
        address,
        isConnected,
        connecting,
        network: network as string | null,
        provider,
        btcBalance,
        walletType,
        connect: openConnectModal,
        disconnect,
        getOP20Balance,
        callContract,
        readContract,
        getOP20ContractCached,
    };
};
