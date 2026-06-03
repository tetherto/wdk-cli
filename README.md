# wdk-cli

A multi-chain crypto wallet for AI agents, built on [Wallet Development Kit (WDK)](https://wallet.tether.io/). Designed to be operated by AI agents (e.g. Claude, ChatGPT, OpenClaw).

## Architecture

```
┌───────────┐        ┌───────────────────────────────────┐
│  wdk-cli  │──IPC──▶│          wdk-daemon               │
│  (CLI)    │        │        (wallet daemon)             │
└───────────┘        │                                   │
                     │  Holds WDK instances in memory    │
┌───────────┐        │  Handles all crypto operations:   │
│  wdk-mcp  │──IPC──▶│  derivation, signing, balances    │
│  (MCP)    │        │  Auto-locks after TTL expires     │
└───────────┘        │                                   │
                     │  Signs tx locally, then submits   │
                     └───────────┬───────────────────────┘
                                 │
                                 │  submits signed tx
                                 ▼
                          ┌──────────────┐
                          │  Blockchain  │
                          │   (RPC/P2P)  │
                          └──────────────┘
```

**wdk-daemon** (Wallet Daemon):
- Starts empty — wallets unlocked individually via socket requests
- Holds WDK instances in memory — owns all cryptographic operations
- Listens on a Unix socket (`daemon.sock`, 0600 permissions)
- Exposes: `unlock_wallet`, `lock_wallet`, `get_address`, `get_balance`, `estimate_fee`, `send`, `list_wallets`, `status`, `lock`
- Per-wallet TTL — each wallet has its own timeout (default: 5 min, `--ttl 0` for unlimited)
- Auto-exits when last wallet is locked

**wdk-cli** (CLI):
- Thin client — no crypto, no keys
- Parses user commands, sends requests to daemon, formats and displays results
- Only interface for passphrase-protected operations: unlock wallet, export seed, delete wallet

**wdk-mcp** (MCP Server):
- Thin client — no crypto, no keys
- Exposes structured wallet tools to AI agents via [Model Context Protocol](https://modelcontextprotocol.io/)
- Routes all operations through the daemon

## Features

- **Wallet** — Multiple named wallets with per-wallet passphrases and BIP-39 seed phrases, encrypted at rest with AES-256-GCM. Background daemon holds keys in memory after unlock, with per-wallet TTL
- **Network** — Bitcoin, Ethereum, Polygon, Arbitrum, Base, BSC, Avalanche, Solana, Tron, Spark, Smart Account (ERC-4337) + testnets. Add custom networks with `network create`
- **Token** — Built-in registry of tokens per network (symbol, decimals, address, indexer/MoonPay/Bitfinex mappings). Add your own with `token add`
- **Get** — Derive wallet addresses, check balances, and view transaction history across all networks
- **Send** — Native and token transfers with fee estimation and dry-run preview. Decimal amounts by default
- **Buy/Sell** — On/off ramp via MoonPay (buy crypto with fiat, sell crypto for fiat)
- **Config** — Per-network configuration with env var overrides

## Requirements

- Node.js >= 22.18.0

## Install

```bash
git clone <repo-url>
cd wdk-cli
npm install
npm link  # makes `wdk` available globally
```

## Quick Start

```bash
# Create wallets (each has its own passphrase)
wdk wallet create --name trading --words 24
wdk wallet create --name savings --words 12

# List all wallets
wdk wallet list

# Unlock wallets individually (starts daemon on first unlock)
wdk wallet unlock --name trading --ttl 0      # unlimited session
wdk wallet unlock --name savings --ttl 60     # 60 min session

# Set default wallet
wdk wallet default --name trading

# Get all wallet addresses across networks
wdk get address

# Get address for a specific network
wdk get address --network ethereum

# Use a specific wallet
wdk get address --network ethereum --wallet trading

# Check all balances across networks (with USD totals)
wdk get balance

# Check balance for a specific wallet
wdk get balance --wallet savings

# Send 1 ETH (decimal default; add --base-units to send in wei)
wdk send --to 0x000000000000000000000000000000000000dEaD --amount 1 --network ethereum

# Send 100 USDT (registered token ticker — see `wdk token list`)
wdk send --to 0x... --amount 100 --token usdt --network ethereum --wallet trading

# Show network details and config
wdk network info --network ethereum

# List supported networks
wdk network list

# Lock a single wallet
wdk wallet lock --name trading

# Lock all wallets when done
wdk wallet lock
```

## Commands

### Wallet

Wallet commands that require passphrase input (create, import, unlock, export, delete) are interactive by default. Set `WDK_PASSPHRASE` env var to skip the interactive prompt for automation and `--json` output.

```bash
wdk wallet create --name <name> [--words 12|24]       # Create a new wallet with a generated seed phrase
wdk wallet import --name <name>                       # Import a wallet from an existing seed phrase
wdk wallet export --name <name>                       # Display the seed phrase of an existing wallet
wdk wallet list                                       # List all wallets with lock/default status
wdk wallet unlock --name <name> [--ttl <minutes>]     # Unlock a wallet for signing transactions
wdk wallet lock --name <name>                         # Lock a single wallet
wdk wallet lock                                       # Lock all wallets (stops daemon)
wdk wallet delete --name <name>                       # Delete a wallet (requires passphrase)
wdk wallet default --name <name>                      # Set the default wallet
wdk wallet rename --name <old> --new-name <new>       # Rename a wallet
```

Supports **multiple named wallets** with **per-wallet passphrases**. Each wallet is stored as `~/.config/wdk-cli/wallets/<name>/seed.enc`. The first wallet created is auto-set as default. Use `--wallet <name>` on other commands to target a specific wallet (defaults to the default wallet).

Passphrase is optional (empty for none). If provided, it encrypts the seed phrase with AES-256-GCM + scrypt.

`wdk wallet unlock` unlocks a single wallet and starts the daemon if not running. Each wallet has its own TTL — use `--ttl 0` for unlimited session, ideal for AI agent environments. The daemon auto-exits when the last wallet is locked.

### Networks

```bash
wdk network list              # List all networks (built-in + custom)
wdk network list --testnet    # Show only testnets
wdk network list --mainnet    # Show only mainnets
wdk network info --network <network>  # Show network details and config
wdk network delete --name <name>      # Delete a custom network (requires unlocked wallet)
```

#### Adding Custom Networks

Use `wdk network create` with `--name` and `--data` (JSON). Requires an unlocked wallet:

```bash
wdk network create --name optimism --data '{
  "displayName": "Optimism",
  "module": "@tetherto/wdk-wallet-evm",
  "testnet": false,
  "config": {
    "provider": "https://mainnet.optimism.io",
    "transferMaxFee": 5000000000000000
  }
}'
```

**`--data` JSON fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `displayName` | Yes | Human-readable name (e.g. `Optimism`) |
| `module` | Yes | Wallet type: `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-btc`, `@tetherto/wdk-wallet-solana`, `@tetherto/wdk-wallet-spark`, `@tetherto/wdk-wallet-tron`, `@tetherto/wdk-wallet-evm-erc-4337` |
| `testnet` | No | Mark as testnet (default: false) |
| `indexerSlug` | No | Override for the indexer chain slug (defaults to the network name). Set only when the network name differs from the chain queried by the indexer — e.g. `smart-account-ethereum` uses `indexerSlug: "ethereum"`. Indexer-supported tokens are derived from the token registry's `metadata.indexer` field. |
| `config` | No | Network config passed to SDK (provider, chainId, etc.) |

After creating the network, register its native and any token assets via `wdk token add`. Custom networks are stored in config and work with all commands (`get balance`, `send`, `get address`, etc.). Network config can also be updated later with `wdk config set --key <key> --value <value> --network <name>`.

### Tokens

The CLI ships with a registry (`wdk.tokens.json`) of all known tokens per network — symbol, decimals, contract address, and provider mappings (indexer code, MoonPay asset code, Bitfinex pair). The `--token` flag on `get balance` / `send` / `get history` / `buy` / `sell` resolves against this registry.

```bash
wdk token list                                          # All tokens, grouped by network
wdk token list --network ethereum                       # Filter to one network
wdk token info --network ethereum --token usdt          # Show full entry
wdk token add --network <n> --token <t> --data '<json>' # Add/override (requires unlocked wallet)
wdk token delete --network <n> --token <t>              # Remove a custom entry
```

**`token add --data` JSON fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `symbol` | Yes | Display symbol (e.g. `USDT`) |
| `decimals` | Yes | Integer 0–24 |
| `isNative` | Yes | Boolean — `true` for the chain's native asset |
| `address` | If `!isNative` | Contract / mint address |
| `metadata.indexer` | No | Indexer code (enables `get history`) |
| `metadata.moonpay` | No | MoonPay asset code (enables `buy`/`sell`) |
| `metadata.bitfinex` | No | Bitfinex pair (enables USD price in `get balance`) |

Custom entries (added via `token add`) live under `customTokens.<network>.<ticker>` and survive `wdk config reset --all`. Built-in entries can be **overridden** by adding a custom entry with the same ticker — a yellow warning is shown when this happens. `token delete` only removes custom entries; the built-in falls through after deletion.

### Get

```bash
wdk get address --network <network> [--index <n>]              # Derive wallet address
wdk get address                                                 # All mainnet addresses
wdk get address --testnet                                       # All testnet addresses
wdk get balance --network ethereum                              # Native ETH balance
wdk get balance --network ethereum --token usdt                 # ERC-20 by registered ticker
wdk get balance                                                 # All mainnet balances with USD
wdk get balance --testnet                                       # All testnet balances with USD
wdk get history --network ethereum                                              # All supported tokens
wdk get history --network ethereum --token xaut --limit 50                      # XAUT transfers, last 50
wdk get history --network ethereum --from-date 2026-01-01 --to-date 2026-03-31  # Date range filter
```

`--token` accepts a registered token ticker (e.g. `usdt`, `eth`, `xaut`). See `wdk token list` for available tokens. Use `wdk token add` to register a new token.

Wallets are derived deterministically from your seed phrase using HD paths (BIP-84 for BTC, BIP-44 for EVM/Solana) — no local state is stored. `get address` works without a provider configured (local derivation only), while `get balance` requires a provider connection.

`get history` uses the [WDK Indexer API](https://github.com/tetherto/wdk-indexer-http). Configure with `WDK_INDEXER_BASE_URL` / `WDK_INDEXER_API_KEY` env vars, or use `wdk config set` for `indexer.baseUrl` and `indexer.apiKey`. If using a proxy provider that includes the API key, only the base URL is needed.

### Send

```bash
wdk send --to <address> --amount <decimal> --network <network>                     # Native (decimal, e.g. 1.5)
wdk send --to <address> --amount <decimal> --token <ticker> --network ethereum     # ERC-20 by registered ticker
wdk send --to <address> --amount <decimal> --token <ticker> --network solana       # SPL by registered ticker
wdk send --to <address> --amount <baseUnits> --base-units --network ethereum       # Opt-in: raw base units
wdk send --to <address> --amount <decimal> --network ethereum --dry-run            # preview without sending
```

`--amount` is decimal by default (e.g. `1.5` for 1.5 ETH, `0.001` for 0.001 BTC). The CLI converts using the token's registered decimals. Pass `--base-units` to interpret the value as raw base units (wei/satoshi/lamport) — useful for scripts that already have BigInt amounts. Fee estimation runs before confirmation; use `--dry-run` to preview the transaction with fee and USD estimates without sending.

### Buy / Sell (On/Off Ramp)

```bash
# Buy crypto with fiat
wdk buy --network ethereum --token usdt                          # Opens MoonPay widget
wdk buy --network ethereum --token eth --fiat-amount 100         # Buy $100 of ETH
wdk buy --network bitcoin --token btc --crypto-amount 0.05       # Buy 0.05 BTC

# Sell crypto for fiat
wdk sell --network ethereum --token usdt                         # Opens MoonPay sell widget
wdk sell --network ethereum --token eth --fiat-amount 200        # Sell ETH for $200
wdk sell --network polygon --token usdt --crypto-amount 50       # Sell 50 USDT on Polygon
```

Uses MoonPay as the fiat provider. All three config values are required:

```bash
wdk config set --key ramp.moonpay.apiKey --value <your-publishable-key>
wdk config set --key ramp.moonpay.signUrl --value <your-sign-url>
wdk config set --key ramp.moonpay.environment --value sandbox    # or production
```

**Options:**

| Flag | Description |
|------|-------------|
| `--network <network>` | Blockchain network (required) |
| `--token <token>` | Crypto asset code, e.g. `usdt`, `eth`, `btc` (required) |
| `--module <module>` | Fiat provider (default: `moonpay`) |
| `--fiat-currency <currency>` | Fiat currency code (default: `usd`) |
| `--fiat-amount <value>` | Fiat amount (mutually exclusive with `--crypto-amount`) |
| `--crypto-amount <value>` | Crypto amount (mutually exclusive with `--fiat-amount`) |

Supported tokens are derived from the registry — any token with `metadata.moonpay` set in `wdk.tokens.json` (or a custom token added via `wdk token add`). Environment validation prevents using production MoonPay with testnet networks (and vice versa).

Configure via `wdk config set --key ramp.moonpay.apiKey --value <key>`, `ramp.moonpay.signUrl`, and `ramp.moonpay.environment`.

### Configuration

Config read commands (`get`, `path`) work without a wallet. Write operations (`set`, `reset`) require an unlocked wallet. All config commands support `--json`.

```bash
# Get
wdk config get --all                                            # Show all config
wdk config get --key ramp.moonpay.apiKey                        # Show a specific value
wdk config get --network ethereum                               # Show Ethereum config
wdk config get --key provider --network ethereum                # Show a network-specific value

# Set
wdk config set --key ramp.moonpay.apiKey --value pk_test_...    # Set a value
wdk config set --key provider --value <rpc-url> --network ethereum              # Network-scoped value
wdk config set --key ramp.moonpay --value '{"apiKey":"...","signUrl":"...","environment":"sandbox"}'  # JSON object
wdk config set --value '{"provider":"https://...","transferMaxFee":5000}' --network optimism    # Full network config

# Reset
wdk config reset --key provider --network ethereum              # Reset a key to default
wdk config reset --all                                          # Reset everything to factory defaults
                                                                # (preserves defaultWallet, customNetworks, customTokens)

# Path
wdk config path                                                 # Config file path
```

Values passed to `--value` support JSON — objects and arrays are parsed and stored as structured data. Use `--network` to scope config to a specific network. When `--key` is omitted with `--network`, the entire network config is set.

Network configuration is passed directly to the wallet SDK. Refer to each [wallet module's documentation](https://docs.wdk.tether.io/sdk/wallet-modules) for supported config keys. Default values are in [`wdk.config.json`](wdk.config.json).

### Global Flags

| Flag | Description |
|------|-------------|
| `--index <n>` | Account index (default: 0) |
| `--wallet <name>` | Wallet name (uses default wallet if omitted) |
| `--json` | Machine-readable JSON output |
| `--verbose` | Debug logging |

## Supported Networks

All built-in networks are defined in [`wdk.config.json`](wdk.config.json). Run `wdk network list` to see all available networks.

Additional networks can be added with `wdk network create`. See [Adding Custom Networks](#adding-custom-networks).

## Non-Interactive Mode

All commands support `--json` for machine-parseable output. Commands that require passphrase input (wallet create, import, unlock, export, delete, and config set/reset) can be run non-interactively by setting the `WDK_PASSPHRASE` environment variable.

```bash
# CI/CD: create and unlock a wallet without interactive prompts
WDK_PASSPHRASE=mypass wdk wallet create --name ci-wallet --json
WDK_PASSPHRASE=mypass wdk wallet unlock --name ci-wallet --ttl 0 --json

# Docker: unlock at container start
WDK_PASSPHRASE=$WALLET_PASS wdk wallet unlock --name default --ttl 0 --json

# Scripting: check balance and parse output
wdk get balance --network ethereum --json | jq '.balance'
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WDK_PASSPHRASE` | Wallet passphrase (skip interactive prompt) |
| `WDK_INDEXER_API_KEY` | Indexer API key (avoids storing secrets in config file) |

## Security

- Seed phrases encrypted at rest (AES-256-GCM + scrypt), per-wallet passphrases with unique salt per wallet
- Seeds and passphrases never accepted as CLI arguments
- Private keys and seeds never leave the daemon process
- Unix socket with 0600 permissions (same-user access only, like ssh-agent)
- No telemetry, no analytics, no external data collection

### Data flow

1. **Unlock**: User unlocks a wallet by name → passphrase sent to daemon over Unix socket → daemon decrypts seed via scrypt + AES-256-GCM → initializes WDK instance in RAM → starts per-wallet TTL timer
2. **Request**: CLI/MCP sends operation (e.g. `get_address`) with wallet name over Unix socket → daemon performs crypto operation → returns result only
3. **Lock**: Individual wallet locked → WDK instance disposed and cleared. When last wallet locks → daemon exits

### Encrypted wallet files

Each wallet is stored in its own directory as `~/.config/wdk-cli/wallets/<name>/seed.enc`:

```json
{ "version": 1, "salt": "...", "iv": "...", "tag": "...", "ciphertext": "..." }
```

Per-wallet passphrase with unique random salt → unique derived key per wallet.

## AI Agent Integration

AI agents interact with wdk-wallet in two ways, depending on their environment:

### MCP — for sandboxed AI models

For AI models that run as applications with limited system access (Claude Desktop, OpenClaw, etc.). The model can only interact with the wallet through structured MCP tools — it cannot run commands or access the filesystem.

```bash
wdk mcp setup --ai-tool claude-desktop    # Configure for Claude Desktop
wdk mcp setup --ai-tool claude-code       # Configure for Claude Code
wdk mcp setup --ai-tool openclaw          # Configure for OpenClaw

wdk mcp remove --ai-tool claude-desktop   # Remove configuration
wdk mcp verify-setup --ai-tool claude-code # Verify config and test MCP server
wdk mcp list                               # Show status across all AI tools
```

Setup auto-detects the Node.js path, validates the MCP server, and writes the config. For Claude Code and OpenClaw, it uses their native CLI (`claude mcp add`, `openclaw mcp set`). For Claude Desktop, it writes the config file directly.

**MCP Tools:**

| Tool | Parameters | Description |
|------|-----------|-------------|
| `get_networks` | `testnet?`, `mainnet?` | List all supported blockchain networks |
| `list_tokens` | `network?` | List registered tokens (omit network for every network) |
| `get_token` | `network`, `token` | Get a single registered token entry (symbol, decimals, address, provider mappings) |
| `get_address` | `network?`, `index?`, `testnet?`, `wallet?` | Get wallet address (omit network for all) |
| `get_balance` | `network?`, `token?`, `index?`, `testnet?`, `wallet?` | Get balance with USD values (omit network for all). `token` is a registered ticker. |
| `get_history` | `network`, `token?`, `limit?`, `index?`, `fromDate?`, `toDate?`, `wallet?` | Transaction history (requires indexer API) |
| `send_token` | `to`, `amount`, `baseUnits?`, `network`, `token?`, `index?`, `dryRun?`, `wallet?` | Send tokens. `amount` is decimal by default; set `baseUnits=true` to interpret as base units. Returns dry-run preview by default; set `dryRun=false` to execute |
| `buy_crypto` | `network`, `token`, `fiatCurrency?`, `fiatAmount?`, `cryptoAmount?`, `index?`, `wallet?` | Buy crypto with fiat. Returns a signed MoonPay URL. |
| `sell_crypto` | `network`, `token`, `fiatCurrency?`, `fiatAmount?`, `cryptoAmount?`, `index?`, `wallet?` | Sell crypto for fiat. Returns a signed MoonPay URL. |

All wallet-dependent tools accept an optional `wallet` parameter (uses default wallet if omitted).

**Important: `send_token` requires two calls.** The tool defaults to `dryRun=true` (preview mode). AI agents must:
1. Call `send_token` first to get a fee/amount preview
2. Show the preview to the user and wait for confirmation
3. Call `send_token` again with `dryRun=false` only after the user confirms

The AI model interacts exclusively through these structured tools — it cannot run shell commands, access the filesystem, or read private keys. All operations route through the daemon over a Unix socket.

### CLI — for local AI agents

For AI agents with full system access (Claude Code, OpenClaw, custom agents). The agent runs `wdk` commands directly with `--json` for machine-parseable output.

```bash
wdk get balance --network ethereum --json
wdk send --to 0xRECIPIENT --amount 1 --network ethereum --dry-run --json     # 1 ETH (decimal)
wdk send --to 0xRECIPIENT --amount 100 --token usdt --network ethereum --json # 100 USDT by ticker
```

The `SKILL.md` file contains complete instructions for AI agents — commands, workflows, error handling, and amount conversions. Feed it as context to your agent.

### Before using either mode

Create and unlock wallets first:
```bash
wdk wallet create --name default --words 24
wdk wallet unlock --name default --ttl 0
```

Both MCP and CLI route through the daemon — the agent never has access to keys or seeds.

## Development

```bash
npm test                  # Run unit tests
npm run test:integration  # Run integration tests (spawns CLI in isolated temp dir)
npm run format            # Format with Prettier
npm run format:check      # Check formatting
```

This project is plain JavaScript (ESM) — no build step. Source under `src/` is run directly via the `bin/*.mjs` entry points.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For support, please open an issue on the GitHub repository.

