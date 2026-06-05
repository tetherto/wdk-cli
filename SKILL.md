---
name: wdk-wallet
description: "Manage a multi-chain crypto wallet via the wdk CLI. Supports multiple named wallets. Use when: user asks to check wallet balance, get wallet address, send tokens, check transaction history, or buy/sell crypto. Supports Bitcoin, Ethereum, Polygon, Arbitrum, Base, BSC, Avalanche, Solana, Tron, Spark, and Smart Accounts (ERC-4337). Triggers on: 'check balance', 'wallet address', 'send tokens', 'transfer tokens', 'transaction history', 'buy crypto', 'sell crypto', 'get address'."
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

Operate a self-custody multi-chain wallet through the `wdk` CLI. For AI agents with shell access (Claude Code, OpenClaw, custom agents). MCP agents (Claude Desktop) use structured tools instead — see `src/mcp/server.js`.

## Rules

1. Always append `--json` to get machine-parseable output (errors also return JSON: `{"error":"...","code":"...","suggestion":"..."}`)
2. Before sending tokens, use `--dry-run` to preview, show summary to user, and wait for confirmation in chat
3. `--amount` accepts **decimal by default** (e.g. `--amount 1.5`). Add `--base-units` to interpret as base units (wei, satoshi, lamport)
4. `--token` is always a registered ticker (e.g. `usdt`, `eth`) — not a contract address. Run `wdk token list` to see available tokens; if a ticker is missing, ask the user to register it via `wdk token add`
5. Never ask for or log seed phrases or passphrases

## Prerequisites

The user must complete these steps before the AI agent can operate the wallet:

1. **Create wallet**: `wdk wallet create --name trading --words 24` (each wallet has its own passphrase)
2. **Unlock wallet**: `wdk wallet unlock --name trading --ttl 0` (unlimited session, or `--ttl 480` for 8 hours; default: 5 min)

Each wallet is unlocked individually with its own passphrase and TTL. These require interactive passphrase input — the AI agent cannot perform them unless `WDK_PASSPHRASE` env var is set.

## Multi-Wallet

Users can create multiple named wallets. Use `--wallet <name>` on any command to target a specific wallet (defaults to the wallet set via `wdk wallet default`).

```bash
# Wallet commands require passphrase (set WDK_PASSPHRASE env var for non-interactive use).
# Use --wallet <name> on data/send commands to target a specific wallet:
wdk get address --network ethereum --wallet trading --json
wdk get balance --network ethereum --wallet savings --json
wdk send --to 0x... --amount 1000 --network ethereum --wallet trading --json
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
# {"index":0,"type":"mainnet","addresses":[{"network":"ethereum","address":"0x..."},{"network":"bitcoin","address":"1A1z..."},...]}

# All testnet addresses
wdk get address --testnet --json
```

### Check Balance

```bash
# Native balance, single network
wdk get balance --network ethereum --json
# {"network":"ethereum","index":0,"balance":"1000000000000000000","symbol":"ETH","decimals":18,"formatted":"1.00 ETH","usd":2100.50}

# Token balance — use registered ticker (see `wdk token list`)
wdk get balance --network ethereum --token usdt --json

# All mainnet balances with USD totals (omit --network)
wdk get balance --json
# {"index":0,"type":"mainnet","balances":[{"network":"ethereum","address":"0x...","balance":"...","symbol":"ETH","decimals":18,"formatted":"1.00 ETH","usd":2100.50},...],"totalUsd":2500.75}

# All testnet balances
wdk get balance --testnet --json
```

### Send

Step 1: Preview the transaction with `--dry-run` to get accurate fee and USD values. `--amount` is decimal by default; add `--base-units` to interpret as base units.

```bash
# Decimal (default) — send 1 ETH
wdk send --to 0xRECIPIENT --amount 1 --network ethereum --dry-run --json
# {"network":"ethereum","networkName":"Ethereum","to":"0x...","amount":"1000000000000000000","amountFormatted":"1.00 ETH","amountUsd":2100.50,"estimatedFee":"21000","estimatedFeeFormatted":"0.00000002 ETH","estimatedFeeUsd":0.04}

# ERC-20: --token is a registered ticker (see `wdk token list`)
wdk send --to 0xRECIPIENT --amount 1.5 --token usdt --network ethereum --dry-run --json

# Base units (opt-in): same value as `--amount 1`
wdk send --to 0xRECIPIENT --amount 1000000000000000000 --base-units --network ethereum --dry-run --json
```

Step 2: Show the summary to the user and wait for confirmation in chat.

Step 3: Execute the transfer (drop `--dry-run`):

```bash
wdk send --to 0xRECIPIENT --amount 1 --network ethereum --json
```

### Transaction History

```bash
wdk get history --network ethereum --json
wdk get history --network ethereum --token usdt --limit 20 --json
wdk get history --network ethereum --from-date 2026-01-01 --to-date 2026-03-31 --json
```

### Buy / Sell (On/Off Ramp)

Buy crypto with fiat or sell crypto for fiat via MoonPay. Opens the MoonPay widget in the browser.

```bash
# Buy crypto
wdk buy --network ethereum --token eth --json
wdk buy --network ethereum --token usdt --fiat-amount 100 --json
wdk buy --network bitcoin --token btc --crypto-amount 0.05 --json

# Sell crypto
wdk sell --network ethereum --token eth --json
wdk sell --network polygon --token usdt --crypto-amount 50 --json
```

`--token` is required (registered ticker). `--fiat-amount` and `--crypto-amount` are mutually exclusive — both accept decimal values. Supported tokens per network are derived from the token registry's `metadata.moonpaySlug` field (see `wdk token list`). Requires `ramp.moonpay.apiKey` / `ramp.moonpay.signUrl` / `ramp.moonpay.environment` to be configured.

### Token Registry

The CLI ships with a registry (`wdk.tokens.json`) of all known tokens — symbol, decimals, contract address, and provider mappings (indexer, MoonPay, Bitfinex). The `--token` flag on any command (`get balance`, `send`, `get history`, `buy`, `sell`) resolves against this registry.

```bash
# Browse the registry (read-only)
wdk token list --json                                       # all networks, all tokens
wdk token list --network ethereum --json                    # one network
wdk token info --network ethereum --token usdt --json       # single entry
```

If the user passes an unregistered ticker, branch on `TOKEN_NOT_SUPPORTED` and **ask the user to register it** — do not run `wdk token add` yourself. Adding tokens modifies persistent config; that's a user-driven decision.

## Amount Conversion

`--amount` is decimal by default — pass `1.5` for 1.5 ETH, `0.001` for 0.001 BTC. The CLI converts using the token's registered decimals (`wdk token info --network <n> --token <t>` to inspect).

If you need to pass raw base units (e.g. you already have a `bigint` value), add `--base-units`. Reference table for the common base-unit multipliers:

| Token | 1 Unit | Base Units |
|-------|--------|------------|
| ETH   | 1 ETH  | 1000000000000000000 (18 decimals) |
| BTC   | 1 BTC  | 100000000 (8 decimals) |
| USDT (EVM) | 1 USDT | 1000000 (6 decimals) |
| USDT (BSC) | 1 USDT | 1000000000000000000 (18 decimals) |
| SOL   | 1 SOL  | 1000000000 (9 decimals) |
| TRX   | 1 TRX  | 1000000 (6 decimals) |

## Error Handling

Errors are returned as structured JSON: `{"error": "...", "code": "...", "suggestion": "..."}` when `--json` is set. Branch on `code`:

| Code | Cause | Action |
|------|-------|--------|
| `KEY_NOT_FOUND` | Wallet not found | Ask user to run `wdk wallet create --name <name>` |
| `WALLET_LOCKED` / `WALLET_NOT_UNLOCKED` | Wallet locked or no session | Ask user to run `wdk wallet unlock --name <name>` |
| `INSUFFICIENT_FUNDS` | Not enough balance | Inform user, show current balance |
| `INVALID_AMOUNT` | Malformed / negative / over-precision amount | Re-prompt user; respect token decimals (see `wdk token info`) |
| `INVALID_ARGUMENT` | Bad/missing CLI flag | Read the message; common cases: missing `--key`, mutually exclusive flags |
| `TOKEN_NOT_SUPPORTED` | Unregistered `--token` | Ask user to register: `wdk token add '{"network":"<n>","token":"<t>","symbol":"...","decimals":...,"isNative":...,...}'` |
| `NETWORK_NOT_SUPPORTED` | Unknown network name, **or** the network exists but has no `indexerSlug` configured (so `get history` is unavailable) | If the network is unknown, ask the user to run `wdk network list`. If the message says "not supported by the indexer API", the network is missing its `indexerSlug` — ask the user to delete and recreate it with `--indexer-slug <chain>` (the chain slug the WDK indexer uses, usually the same as the network name). |
| `NETWORK_ERROR` (403 from indexer) | Missing/invalid API key | Ask user: `wdk config set --key indexer.apiKey --value <key>` |
| `MISSING_CONFIG` (moonpay) | Ramp not configured | Ask user: `wdk config set --key ramp.moonpay.apiKey --value <key>` (also `signUrl`, `environment`) |
| `ENVIRONMENT_MISMATCH` | sandbox key on mainnet (or vice versa) | Ask user: `wdk config set --key ramp.moonpay.environment --value <sandbox\|production>` |

## Restricted Actions (NEVER do these)

These actions are **strictly forbidden** for AI agents. Do not attempt them under any circumstances:

1. **NEVER create or import wallets** — `wdk wallet create` and `wdk wallet import` require passphrase input. Tell the user to do it themselves.
2. **NEVER unlock the wallet** — `wdk wallet unlock` requires passphrase input. If the wallet is locked, tell the user to unlock it.
3. **NEVER export or ask for seed phrases or passphrases** — this is sensitive data that must never be logged, stored, or transmitted.
4. **NEVER mutate the network or token registry** — `wdk network create / delete`, `wdk token add / delete`. These modify persistent user config and are user-driven decisions. If a command needs a registry change, surface the suggestion to the user and let them run it.

These restrictions exist for security. Only the human user can perform wallet management through interactive terminal input (or via `WDK_PASSPHRASE` env var in automated environments).
