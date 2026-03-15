---
name: wdk-wallet
description: "Manage a multi-chain crypto wallet via the wdk CLI. Use when: user asks to check wallet balance, get wallet address, send crypto/tokens, check transaction history, or manage spending policies. Supports Bitcoin, Ethereum, Polygon, Arbitrum, Base, BSC, Avalanche, Solana, Tron, Spark, and Smart Accounts (ERC-4337). Triggers on: 'send ETH', 'check balance', 'wallet address', 'transfer USDT', 'crypto balance', 'send tokens', 'transaction history'."
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

1. Always append `--json` to get machine-parseable output
2. Check `wdk policy show --json` before sending to respect spending limits
4. Amounts are always in **base units** (wei, satoshis, lamports) — never decimals
5. Never ask for or log seed phrases or passwords

## Prerequisites

The user must complete these steps before the AI agent can operate the wallet:

1. **Create wallet**: `wdk wallet create --words 24`
2. **Unlock session**: `wdk wallet unlock --ttl 480` (session duration in minutes, e.g. 480 = 8 hours)
3. **Configure policy** (optional): `wdk policy set enabled true`, `wdk policy set maxPerCallUsd 100`, etc.

These require interactive password input — the AI agent cannot perform them.

## Commands

### List Networks

```bash
wdk network list --json
wdk network info --network ethereum --json
```

### Get Address

```bash
wdk get address --network ethereum --json
# {"network":"ethereum","index":0,"address":"0x..."}

wdk get address --network solana --json
wdk get address --network bitcoin --json
```

### Check Balance

```bash
wdk get balance --network ethereum --json
# {"network":"ethereum","index":0,"address":"0x...","balance":"1000000000000000000","formatted":"1.00 ETH"}

# Token balance (USDT)
wdk get balance --network ethereum --token 0xdAC17F958D2ee523a2206206994597C13D831ec7 --json
```

### Send

```bash
# Native transfer
wdk send --to 0xRECIPIENT --amount 1000000000000000000 --network ethereum --json

# Token transfer (USDT on Ethereum)
wdk send --to 0xRECIPIENT --amount 1000000 --network ethereum --token 0xdAC17F958D2ee523a2206206994597C13D831ec7 --json
```

### Transaction History

```bash
wdk get history --network ethereum --json
wdk get history --network ethereum --token usdt --limit 20 --json
```

### Check Policy Before Sending

```bash
wdk policy show --json
# {"policy":{"enabled":true,"maxPerCallUsd":100,"maxPerDayUsd":1000,"maxTxPerDay":50,"whitelist":[]},"spending":{"date":"2025-01-15","totalUsd":45.00,"txCount":3,"transactions":[...]}}
```

If policy is enabled, verify:
- Transaction USD value < `maxPerCallUsd` (0 = unlimited)
- `spending.totalUsd` + transaction < `maxPerDayUsd` (0 = unlimited)
- `spending.txCount` < `maxTxPerDay` (0 = unlimited)
- Recipient is in `whitelist` (empty = any address allowed)

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
| "No wallet found" | Ask user to run `wdk wallet create` |
| "Wallet is locked" | Ask user to run `wdk wallet unlock` |
| "Insufficient balance" | Inform user, show current balance |
| "POLICY_VIOLATION" | Show policy limits, ask user to adjust |
| "not in the whitelist" | Ask user to whitelist the address |
| "403 Forbidden" (indexer) | Ask user to set API key: `wdk config set indexer.apiKey <key>` |
| "Unknown token" | Token not in known registry, provide contract address |

## Network Details

See [references/networks.md](references/networks.md) for full network list and token addresses.

## What You Cannot Do

- **Modify policies** — requires wallet password in interactive terminal
- **Export seed phrases** — requires interactive password prompt
- **Create/import wallets** — requires interactive password prompt

These are intentionally restricted for security. Only the human user can perform these actions.
