const WALLET_ERROR_MAP: [test: RegExp, friendly: string][] = [
    [
        /another approval request is already active/i,
        'A wallet popup is already open. Please approve or reject it first.',
    ],
    [
        /user rejected|user denied|user cancel/i,
        'Transaction cancelled by user.',
    ],
    [
        /insufficient funds for gas/i,
        'Not enough BTC for gas fees. Top up your wallet.',
    ],
    [
        /wallet.*locked|account.*locked/i,
        'Wallet is locked. Please unlock it and try again.',
    ],
    [
        /timeout|timed? ?out/i,
        'Wallet request timed out. Please try again.',
    ],
    [
        /read beyond buffer length|buffer is only \d+ bytes/i,
        'Contract call reverted — the IDO may not be active yet or the transaction is invalid.',
    ],
    [
        /signer is not allowed/i,
        'Wallet extension rejected the request. Please update your wallet extension.',
    ],
];

export function friendlyWalletError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    for (const [re, friendly] of WALLET_ERROR_MAP) {
        if (re.test(raw)) return friendly;
    }
    return raw;
}
