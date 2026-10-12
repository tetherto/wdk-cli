---
name: wdk-wallet
description: "Manage a multi-chain crypto wallet via the wdk CLI. Supports multiple named wallets. Use when: user asks to check wallet balance, get wallet address, send tokens, swap tokens, bridge tokens across chains, check transaction history, buy/sell crypto, or invoke chain-specific wallet module methods (discover them with `wdk method list`). Supports Bitcoin, Ethereum, Polygon, Arbitrum, Base, BSC, Avalanche, Solana, Tron, Spark, and Smart Accounts (ERC-4337). Triggers on: 'check balance', 'wallet address', 'send tokens', 'transfer tokens', 'swap tokens', 'bridge tokens', 'cross-chain swap', 'best route', 'transaction history', 'buy crypto', 'sell crypto', 'get address'."
metadata:
  openclaw:
    requires:
      bins: [wdk]
    install:
      - id: wdk-cli
        kind: node
        package: "@tetherto/wdk-cli"
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

Each entry carries `enabled`. A network the user disabled stays listed with `enabled: false` — treat it as unusable and tell the user to run `wdk network enable --name <network>` themselves. A network whose wallet module is disabled is **not listed at all**: if the user expects one that is missing, have them check `wdk module list` for a `disabled` module.

### Get Address

```bash
# Single network
wdk get address --network ethereum --json
# {"network":"ethereum","index":0,"address":"0x..."}

# All mainnet addresses
wdk get address --all --json
# {"index":0,"type":"mainnet","addresses":[{"network":"ethereum","address":"0x..."},{"network":"bitcoin","address":"1A1z..."},...]}

# All testnet addresses (testnets only)
wdk get address --all --testnet --json
```

### Check Balance

```bash
# Native balance, single network
wdk get balance --network ethereum --json
# {"network":"ethereum","index":0,"balance":"1000000000000000000","symbol":"ETH","decimals":18,"formatted":"1.00 ETH","usd":2100.50,"address":"0x..."}

# Token balance — use registered ticker (see `wdk token list`)
wdk get balance --network ethereum --token usdt --json

# All mainnet balances with USD totals
wdk get balance --all --json
# {"index":0,"type":"mainnet","balances":[{"network":"ethereum","address":"0x...","balance":"...","symbol":"ETH","decimals":18,"formatted":"1.00 ETH","usd":2100.50},...],"totalUsd":2500.75}

# All testnet balances (testnets only, instead of mainnets)
wdk get balance --all --testnet --json
```

### Send

Step 1: Preview the transaction with `--dry-run` to get accurate fee and USD values. `--amount` is decimal by default; add `--base-units` to interpret as base units.

```bash
# Decimal (default) — send 1 ETH
wdk send --to 0xRECIPIENT --amount 1 --network ethereum --dry-run --json
# {"network":"ethereum","networkName":"Ethereum","from":"0x...","to":"0x...","amount":"1000000000000000000","amountFormatted":"1.00 ETH","amountUsd":2100.50,"estimatedFee":"21000","estimatedFeeFormatted":"0.00000002 ETH","estimatedFeeUsd":0.04}

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

### Sign / Verify Message

```bash
wdk message sign --network ethereum --message "hello" --json
# {"network":"ethereum","index":0,"address":"0x...","message":"hello","signature":"0x..."}
wdk message verify --network ethereum --message "hello" --signature 0xSIG --json
# {"network":"ethereum","index":0,"message":"hello","signature":"0x...","address":"0x...","valid":true}
```

**Signatures can authorize actions on some chains — show the exact message to the user and wait for confirmation in chat before signing.**

### Get Transaction

```bash
wdk get transaction --network ethereum --hash 0xTXHASH --json
# {"network":"ethereum","hash":"0x...","index":0,"transaction":{"hash":"0x...","finality":"final","success":true,"block":46147,"fee":"1050000000000000"}}

# Block until mined (finality: confirmed | final; --timeout in ms)
wdk get transaction --network ethereum --hash 0xTXHASH --finality confirmed --timeout 60000 --json
```

### Swap / Bridge

Swap one token for another, or bridge the same token to another chain — routed across installed protocols (best quote wins: highest output for exact-in, lowest input for `--amount-out`). Same dry-run → confirm → execute flow as Send: funds move on execute.

Step 1: Preview with `--dry-run`.

```bash
# Swap (add --to-network for a cross-chain swap)
wdk swap --network ethereum --from-token usdt --to-token eth --amount-in 100 --dry-run --json
# {"kind":"swap","from":"0x...","protocol":"symbiosis","payFormatted":"100 USDT","receiveFormatted":"0.0407 ETH","receiveUsd":100.10,"feesIncludedFormatted":"includes 0.00015 ETH Symbiosis on-chain fee","skipped":[{"protocol":"velora","reason":"insufficient funds"}]}
# feesFormatted = fees paid on top of the amounts (gas/bridge); feesIncludedFormatted = provider fees already deducted from the quoted amounts

# Bridge the same token to another chain (exact-in)
wdk bridge --network ethereum --token usdt --to-network avalanche --amount 100 --dry-run --json
```

Step 2: Show the preview (protocol, amounts, USD, fees, `skipped`) to the user and wait for confirmation.

Step 3: Execute (drop `--dry-run`):

```bash
wdk swap --network ethereum --from-token usdt --to-token eth --amount-in 100 --json
```

Rules:

1. `swap` takes `--from-token`/`--to-token` (`--amount-in` or `--amount-out`; add `--to-network` for cross-chain); `bridge` takes one `--token` + `--to-network` with exact-in `--amount`.
2. Best-route by default; the `skipped` array lists protocols that failed and why. Only pass `--protocol <name>` when the user names one — `wdk provider list --json` (read-only) shows the valid names, each with the `kind` it serves and whether it is enabled.
3. Execute moves funds — treat like Send: dry-run, show the user, confirm.
4. A `skipped` reason that is a configuration problem (missing API key, missing chain) is the user's to fix with `wdk config set --key providers.<name>.config.<key> --value <value>`, or `providers.<name>.networks.<network>.<key>` for one chain only. Surface the command; never run it.

### Transaction History

```bash
wdk get history --network ethereum --json
wdk get history --network ethereum --token usdt --limit 20 --json
wdk get history --network ethereum --from-date 2026-01-01 --to-date 2026-03-31 --json
```

### Module Methods

Chain-specific methods beyond the generic interface (address, balance, send), declared per wallet module in the catalog (`wdk.config.json`). Discover first, then call.

```bash
# Discover declared methods (no unlocked wallet needed)
wdk method list --network spark --json
# {"network":"spark","methods":[{"name":"getStaticDepositAddress","kind":"read","params":{}},{"name":"claimStaticDeposit","kind":"write","params":{"txid":"string"}},...]}
wdk method list --all --json

# Invoke: each declared param is a flag; camelCase params map to kebab-case flags (maxFee → --max-fee)
wdk method call --network spark --name getStaticDepositAddress --json
# {"network":"spark","method":"getStaticDepositAddress","address":"sp1...","result":"bc1p..."}
wdk method call --network ethereum --name getAllowance --token 0xTOKEN --spender 0xSPENDER --json
# {"network":"ethereum","method":"getAllowance","address":"0x...","result":"0"}
```

Rules:

1. Check the `kind` field from `method list`: `read` methods can be called freely; **`write` methods move funds or mutate on-chain state — show the exact method and args to the user and wait for confirmation in chat before calling** (same rule as Send, but there is no dry-run for methods).
2. Value formats: `bigint` params take integer strings in base units (e.g. sats); `string[]` params take comma-separated values; structured params (objects/arrays) take a JSON string with `bigint` fields as strings.
3. Only catalog-declared methods are invocable. An unknown method returns `INVALID_ARGUMENT` with an `Available methods: ...` suggestion — never retry with guessed names.

### Buy / Sell (On/Off Ramp)

Buy crypto with fiat or sell crypto for fiat. Prints a provider URL for the user to open in a browser.

```bash
# Buy crypto
wdk buy --network ethereum --token eth --fiat-amount 50 --provider moonpay --json
wdk buy --network bitcoin --token btc --crypto-amount 0.05 --provider transak --json

# Sell crypto
wdk sell --network ethereum --token eth --crypto-amount 0.5 --provider moonpay --json
wdk sell --network tron --token usdt --crypto-amount 50 --provider transak --json
```

`--token` is required (registered ticker). Provide exactly one of `--fiat-amount` or `--crypto-amount` — both accept decimal values.

MoonPay and Transak both ship enabled, so **`--provider` is required** until one is disabled; without it the command fails with `INVALID_ARGUMENT` naming both. Supported tokens per network come from that provider's `metadata.slugs.<provider>` entry (see `wdk token list`), and each provider needs its own `providers.<name>.config` filled in.

A quote is not always available — the provider may decline to price a pair. The URL is still returned, and `quoteUnavailable` carries the reason.

### Token Registry

The CLI ships with a registry (`wdk.tokens.json`) of all known tokens — symbol, decimals, contract address, and provider mappings (indexer, MoonPay, Transak, Bitfinex). The `--token` flag on any command (`get balance`, `send`, `get history`, `buy`, `sell`) resolves against this registry.

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
| `INVALID_ARGUMENT` | Bad/missing CLI flag, an ambiguous or unusable `--provider`, or an unusable `--protocol` | Read the message; common cases: missing `--key`, mutually exclusive flags. For `--protocol`, check `wdk provider list` — the name may be unregistered, disabled, or of a `kind` that serves the other operation. When it is disabled the hint names the enable command: suggest it, never run it. On `buy` / `sell`, the message `Several fiat providers are available` means `--provider` was omitted while more than one is enabled — the message names them, so re-run with one |
| `TOKEN_NOT_SUPPORTED` | Unregistered `--token` | Ask user to register: `wdk token add '{"network":"<n>","token":"<t>","symbol":"...","decimals":...,"isNative":...,...}'` |
| `NETWORK_NOT_SUPPORTED` | Unknown network name, **or** the network exists but has no `indexerSlug` configured (so `get history` is unavailable) | If the message says "is disabled", the user disabled the network or its module — the error hint names the exact enable command to suggest (never run it yourself). On a disabled network `wdk token list`, `wdk token info` and `wdk method list` fail the same way; report that rather than retrying. If the network is unknown, ask the user to run `wdk network list`. If the message says "not supported by the indexer API", the network is missing its `indexerSlug` — ask the user to delete and recreate it with `"indexerSlug": "<chain>"` in the JSON spec (the chain slug the WDK indexer uses, usually the same as the network name). |
| `UNSUPPORTED_MODULE` | The module backing a network, protocol, or provider is not installed, or is not registered at all | The hint names the exact `wdk module add --name <module>` command. Surface it to the user and stop — installing modules is forbidden (see Restricted Actions). On `buy` / `sell` it means the named `--provider` is registered but its module was never installed |
| `NETWORK_ERROR` (403 from indexer) | The indexer rejected the configured API key | Report it and ask the user to check that provider's config: `wdk config set --key providers.<provider>.config.<setting> --value <value>`. Do not retry |
| `MISSING_CONFIG` (indexer) | No indexer enabled, or its config is incomplete | The message names what is missing. Report it and ask the user to set it: `wdk config set --key providers.<provider>.config.<setting> --value <value>` |
| `MISSING_CONFIG` (fiat) | Ramp not configured | Ask user: `wdk config set --key providers.<provider>.config.apiKey --value <key>` (also its other config keys) |
| `INVALID_CONFIG` (buy/sell) | The fiat provider rejected the request as unauthorized | Its credentials are missing or wrong. The message carries the provider's own reason — report it and ask the user to set the key: `wdk config set --key providers.<provider>.config.apiKey --value <key>`. Do not retry |
| `SIGN_FAILED` | The configured signing/widget endpoint failed | The message carries the endpoint's own reason. Report it; do not retry |

## Restricted Actions (NEVER do these)

These actions are **strictly forbidden** for AI agents. Do not attempt them under any circumstances:

1. **NEVER create or import wallets** — not under any circumstances. The `--seed-stdin` and `--new-passphrase-stdin` flags exist for human-operated scripts only (provisioning, CI, backup tooling) — agents must never invoke them, even with secrets provided by the user in chat. Tell the user to do it themselves.
2. **NEVER unlock the wallet** — `wdk wallet unlock` requires passphrase input. If the wallet is locked, tell the user to unlock it.
3. **NEVER export or ask for seed phrases or passphrases** — this is sensitive data that must never be logged, stored, or transmitted.
4. **NEVER mutate the network, token, or provider registry** — `wdk network create / delete`, `wdk token add / delete`, `wdk provider add / delete`. These modify persistent user config and are user-driven decisions. If a command needs a registry change, surface the suggestion to the user and let them run it.
5. **NEVER run `wdk module add / remove / enable / disable`, `wdk network enable / disable`, `wdk provider enable / disable`, or `wdk token enable / disable`** — add and remove download and install executable code that runs inside the wallet daemon; `wdk provider add` registers an installed module to run there too; enable and disable change which modules, networks, providers, and tokens the CLI uses (and lock all wallets). If something is missing or disabled, tell the user and let them decide.
6. **NEVER run `wdk config set / reset`** — every provider credential and network setting is persistent user config, and each write locks all wallets. Surface the exact command for the user to run.

These restrictions exist for security. Only the human user can perform wallet management through interactive terminal input (or via `WDK_PASSPHRASE` env var in automated environments).
