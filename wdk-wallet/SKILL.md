---
name: wdk-wallet
description: "Manage a multi-chain crypto wallet via the wdk CLI. Supports multiple named wallets. Use when: user asks to check wallet balance, get wallet address, send crypto/tokens, or check transaction history. Supports Bitcoin, Ethereum, Polygon, Arbitrum, Base, BSC, Avalanche, Solana, Tron, Spark, and Smart Accounts (ERC-4337). Triggers on: 'send ETH', 'check balance', 'wallet address', 'transfer USDT', 'crypto balance', 'send tokens', 'transaction history'."
metadata:
  openclaw:
    requires:
      bins: [wdk]
    install:
      - id: wdk-cli
        kind: node
        package: wdk-cli
        bins: [wdk]
        label: "Install WDK Wallet CLI (npm)"
---

# WDK Wallet Skill

Operate a self-custody multi-chain wallet through the `wdk` CLI. All commands run locally on the user's machine.

## Rules

1. Always append `--json` to get machine-parseable output (errors also return JSON: `{"error":"...","code":"...","suggestion":"..."}`)
2. Before sending, use `--dry-run` to preview, show summary to user, and wait for confirmation in chat
3. Use `--yes` when sending (user already confirmed in chat, CLI prompt would hang)
4. Amounts are always in **base units** (wei, satoshis, lamports) — never decimals
5. Never ask for or log seed phrases or passwords

## Prerequisites

The user must complete these steps before the AI agent can operate the wallet:

1. **Create wallet**: `wdk wallet create --name trading --words 24` (each wallet has its own password)
2. **Unlock wallet**: `wdk wallet unlock --name trading --ttl 0` (unlimited session, or `--ttl 480` for 8 hours; default: 30 min)

Each wallet is unlocked individually with its own password and TTL. These require interactive password input — the AI agent cannot perform them.

## Multi-Wallet

Users can create multiple named wallets. Use `--wallet <name>` on any command to target a specific wallet (defaults to `"default"`).

```bash
wdk wallet list --json
# Lists all wallets with lock status

wdk get address --network ethereum --wallet trading --json
wdk get balance --network ethereum --wallet savings --json
wdk send --to 0x... --amount 1000 --network ethereum --wallet trading --json --yes
```

## Commands

### List Networks

```bash
wdk network list --json
wdk network info --network ethereum --json
```

### Get Address

```bash
# Single network
wdk get address --network ethereum --json
# {"network":"ethereum","index":0,"address":"0x..."}

# All mainnet addresses (omit --network)
wdk get address --json
# {"index":0,"addresses":[{"network":"ethereum","address":"0x..."},{"network":"bitcoin","address":"1A1z..."},...]}

# All testnet addresses
wdk get address --testnet --json
```

### Check Balance

```bash
# Single network
wdk get balance --network ethereum --json
# {"network":"ethereum","index":0,"balance":"1000000000000000000","symbol":"ETH","decimals":18}

# Token balance (USDT)
wdk get balance --network ethereum --token 0xdAC17F958D2ee523a2206206994597C13D831ec7 --json

# All mainnet balances with USD totals (omit --network)
wdk get balance --json
# {"index":0,"balances":[{"network":"ethereum","address":"0x...","balance":"...","formatted":"1.00 ETH","usd":2100.50},...],"totalUsd":2500.75}

# All testnet balances
wdk get balance --testnet --json
```

### Send

Step 1: Preview the transaction with `--dry-run` to get accurate fee and USD values:

```bash
wdk send --to 0xRECIPIENT --amount 1000000000000000000 --network ethereum --dry-run
# {"network":"ethereum","networkName":"Ethereum","to":"0x...","amount":"1000000000000000000","amountFormatted":"1.00 ETH","amountUsd":2100.50,"estimatedFee":"21000","estimatedFeeFormatted":"0.00000002 ETH","estimatedFeeUsd":0.04}
```

Step 2: Show the summary to the user and wait for confirmation in chat.

Step 3: Execute the transfer with `--yes` (user already confirmed):

```bash
wdk send --to 0xRECIPIENT --amount 1000000000000000000 --network ethereum --json --yes
```

### Transaction History

```bash
wdk get history --network ethereum --json
wdk get history --network ethereum --token usdt --limit 20 --json
wdk get history --network ethereum --from-date 2026-01-01 --to-date 2026-03-31 --json
```

## Amount Conversion

Amounts are in base units. Common conversions:

| Token | 1 Unit | Base Units |
|-------|--------|------------|
| ETH   | 1 ETH  | 1000000000000000000 (18 decimals) |
| BTC   | 1 BTC  | 100000000 (8 decimals) |
| USDT (EVM) | 1 USDT | 1000000 (6 decimals) |
| USDT (BSC) | 1 USDT | 1000000000000000000 (18 decimals) |
| SOL   | 1 SOL  | 1000000000 (9 decimals) |
| TRX   | 1 TRX  | 1000000 (6 decimals) |

## Error Handling

| Error | Action |
|-------|--------|
| "No wallet found" | Ask user to run `wdk wallet create --name <name>` |
| "Wallet is locked" | Ask user to run `wdk wallet unlock --name <name>` |
| "Insufficient balance" | Inform user, show current balance |
| "403 Forbidden" (indexer) | Ask user to set API key: `wdk config set indexer.apiKey <key>` |
| "Unknown token" | Token not in known registry, provide contract address |

## Restricted Actions (NEVER do these)

These actions are **strictly forbidden** for AI agents. Do not attempt them under any circumstances:

1. **NEVER create or import wallets** — `wdk wallet create --name <name>` and `wdk wallet import --name <name>` require interactive password input. Tell the user to do it themselves.
2. **NEVER unlock the wallet** — `wdk wallet unlock --name <name>` requires interactive password input. If the wallet is locked, tell the user to unlock it.
3. **NEVER export or ask for seed phrases or passwords** — this is sensitive data that must never be logged, stored, or transmitted.

These restrictions exist for security. Only the human user can perform wallet management through interactive terminal input.
