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
- Exposes: `unlock_wallet`, `lock_wallet`, `get_address`, `get_balance`, `get_history`, `estimate_fee`, `send`, `list_wallets`, `status`, `lock`
- Per-wallet TTL — each wallet has its own timeout (default: 30 min, `--ttl 0` for unlimited)
- Auto-exits when last wallet is locked

**wdk-cli** (CLI):
- Thin client — no crypto, no keys
- Parses user commands, sends requests to daemon, formats and displays results
- Only interface for password-protected operations: unlock wallet, export seed, delete wallet

**wdk-mcp** (MCP Server):
- Thin client — no crypto, no keys
- Exposes structured wallet tools to AI agents via [Model Context Protocol](https://modelcontextprotocol.io/)
- Routes all operations through the daemon

## Features

- **Wallet** — Multiple named wallets with per-wallet passwords and BIP-39 seed phrases, encrypted at rest with AES-256-GCM. Background daemon holds keys in memory after unlock, with per-wallet TTL
- **Network** — Bitcoin, Ethereum, Polygon, Arbitrum, Base, BSC, Avalanche, Solana, Tron, Spark, Smart Account (ERC-4337) + testnets. Add custom networks with `network create`
- **Get** — Derive wallet addresses, check balances, and view transaction history across all networks
- **Send** — Native and token transfers with fee estimation, confirmation, and dry-run preview
- **Config** — Per-network configuration with env var overrides

## Requirements

- Node.js >= 20

## Install

```bash
git clone <repo-url>
cd wdk-cli
npm install
npm run build
npm link  # makes `wdk` available globally
```

## Quick Start

```bash
# Create wallets (each has its own password)
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

# Send ETH (amount in wei)
wdk send --to 0x000000000000000000000000000000000000dEaD --amount 1000000000000000000 --network ethereum

# Send from a specific wallet
wdk send --to 0x... --amount 1000 --network ethereum --wallet trading

# Show network details and config
wdk network info --network ethereum

# List supported networks
wdk network list

# Lock a single wallet
wdk wallet lock --name trading

# Lock all wallets when done
wdk wallet lock --all
```

## Commands

### Wallet

```bash
wdk wallet create --name <name> [--words 12|24]     # Generate new BIP-39 seed phrase
wdk wallet import --name <name>                     # Import existing seed phrase (interactive)
wdk wallet export --name <name>                     # Export seed phrase (decrypt and display)
wdk wallet list                                     # List all wallets with lock/default status
wdk wallet unlock --name <name> [--ttl <minutes>]   # Unlock a wallet (starts daemon if needed)
wdk wallet lock --name <name>                       # Lock a single wallet
wdk wallet lock --all                               # Lock all wallets (stops daemon)
wdk wallet delete --name <name>                     # Delete a wallet (requires password)
wdk wallet default --name <name>                    # Set the default wallet
wdk wallet rename --name <old> --new <new>          # Rename a wallet
```

Supports **multiple named wallets** with **per-wallet passwords**. Each wallet is stored as `~/.config/wdk-cli/wallets/<name>/seed.enc`. The first wallet created is auto-set as default. Use `--wallet <name>` on other commands to target a specific wallet (defaults to the default wallet).

`wdk wallet unlock` unlocks a single wallet and starts the daemon if not running. Each wallet has its own TTL — use `--ttl 0` for unlimited session, ideal for AI agent environments. The daemon auto-exits when the last wallet is locked.

### Networks

```bash
wdk network list              # List all networks (built-in + custom)
wdk network list --testnet    # Show only testnets
wdk network list --mainnet    # Show only mainnets
wdk network info --network <network>  # Show network details and config
wdk network delete <name>     # Delete a custom network
```

#### Adding Custom Networks

Use `wdk network create` with `--name` and `--network-data` (JSON):

```bash
wdk network create --name optimism --network-data '{
  "displayName": "Optimism",
  "module": "@tetherto/wdk-wallet-evm",
  "nativeSymbol": "ETH",
  "decimals": 18,
  "testnet": false,
  "indexerBlockchain": "optimism",
  "tokens": [
    { "address": "0x94b008aA00579c1307B0EF2c499aD98a8ce58e68", "symbol": "USDT", "decimals": 6 }
  ],
  "config": {
    "provider": "https://mainnet.optimism.io",
    "transferMaxFee": 5000000000000000
  }
}'
```

**`--network-data` JSON fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `displayName` | Yes | Human-readable name (e.g. `Optimism`) |
| `module` | Yes | Wallet type: `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-btc`, `@tetherto/wdk-wallet-solana`, `@tetherto/wdk-wallet-spark`, `@tetherto/wdk-wallet-tron`, `@tetherto/wdk-wallet-evm-erc-4337` |
| `nativeSymbol` | Yes | Native token symbol (e.g. `ETH`) |
| `decimals` | No | Token decimals (default: based on module) |
| `testnet` | No | Mark as testnet (default: false) |
| `indexerBlockchain` | No | Blockchain name for indexer API (`get history`) |
| `tokens` | No | Known tokens: `[{ address, symbol, decimals }]` |
| `config` | No | Network config passed to SDK (provider, chainId, etc.) |

Custom networks are stored in config and work with all commands (`get balance`, `send`, `get address`, etc.). Network config can also be updated later with `wdk config set <key> <value> --network <name>`.

### Get

```bash
wdk get address --network <network> [--index <n>]              # Derive wallet address
wdk get address                                                 # All mainnet addresses
wdk get address --testnet                                       # All testnet addresses
wdk get balance --network ethereum                              # Native ETH balance
wdk get balance --network ethereum --token 0xdAC17F...          # ERC-20 token balance
wdk get balance                                                 # All mainnet balances with USD
wdk get balance --testnet                                       # All testnet balances with USD
wdk get history --network ethereum                                              # USDT transfer history
wdk get history --network ethereum --token xaut --limit 50                      # XAUT transfers, last 50
wdk get history --network ethereum --from-date 2026-01-01 --to-date 2026-03-31  # Date range filter
```

Known tokens (e.g. USDT) are automatically resolved with correct decimals and symbol. Unknown tokens fall back to raw base-unit amounts.

Wallets are derived deterministically from your seed phrase using HD paths (BIP-84 for BTC, BIP-44 for EVM/Solana) — no local state is stored. `get address` works without a provider configured (local derivation only), while `get balance` requires a provider connection.

`get history` uses the [WDK Indexer API](https://github.com/tetherto/wdk-indexer-http). Configure with `WDK_INDEXER_BASE_URL` / `WDK_INDEXER_API_KEY` env vars, or use `wdk config set` for `indexer.baseUrl` and `indexer.apiKey`. If using a proxy provider that includes the API key, only the base URL is needed.

### Send

```bash
wdk send --to <address> --amount <base-units> --network <network>
wdk send --to <address> --amount <base-units> --network ethereum --token <contract>  # ERC-20 transfer
wdk send --to <address> --amount <base-units> --network solana --token <mint>        # SPL transfer
wdk send --to <address> --amount <base-units> --network ethereum --yes               # skip confirmation
wdk send --to <address> --amount <base-units> --network ethereum --dry-run           # preview without sending
```

Amounts are in base units (wei for EVM, satoshis for BTC, lamports for Solana). Fee estimation runs before confirmation. Use `--dry-run` to preview the transaction with fee and USD estimates without sending.

### Configuration

```bash
wdk config list                                                     # Show all config
wdk config get                                                      # Show global settings
wdk config get --network ethereum                                   # Show Ethereum config
wdk config set provider <rpc-url> --network ethereum                # Custom RPC for Ethereum
wdk config set transferMaxFee 50000000000 --network ethereum        # Max fee for Ethereum
wdk config set host electrum.example.com --network bitcoin          # Custom Electrum host for BTC
wdk config set port 50002 --network bitcoin                         # Custom Electrum port
wdk config set protocol tls --network bitcoin                       # Electrum transport (tcp/tls/ssl)
wdk config reset provider --network ethereum                        # Reset to default
wdk config path                                                     # Config file location
```

Network configuration is passed directly to the wallet SDK. Refer to each [wallet module's documentation](https://docs.wdk.tether.io/sdk/wallet-modules) for supported config keys. Default values are in [`wdk.config.json`](wdk.config.json).

### Global Flags

| Flag | Description |
|------|-------------|
| `--network <network>` | Override default network |
| `--index <n>` | Account index (default: 0) |
| `--wallet <name>` | Wallet name (uses default wallet if omitted) |
| `--json` | Machine-readable JSON output |

| `--verbose` | Debug logging |

## Supported Networks

All built-in networks are defined in [`wdk.config.json`](wdk.config.json). Run `wdk network list` to see all available networks.

Additional networks can be added with `wdk network create`. See [Adding Custom Networks](#adding-custom-networks).

## Environment Variables

Environment variables override config values at runtime without modifying the config file. Useful for CI/CD, Docker, or temporary overrides.

| Variable | Description |
|----------|-------------|
| `WDK_PASSWORD` | Wallet unlock password (skip interactive prompt) |
| `WDK_INDEXER_BASE_URL` | Override `indexer.baseUrl` from config |
| `WDK_INDEXER_API_KEY` | Override `indexer.apiKey` from config |

Priority: environment variable > `wdk config set` > `wdk.config.json` defaults.

## Security

- Seed phrases encrypted at rest (AES-256-GCM + scrypt), per-wallet passwords with unique salt per wallet
- Seeds and passwords never accepted as CLI arguments
- Private keys and seeds never leave the daemon process
- Unix socket with 0600 permissions (same-user access only, like ssh-agent)
- No telemetry, no analytics, no external data collection

### Data flow

1. **Unlock**: User unlocks a wallet by name → password sent to daemon over Unix socket → daemon decrypts seed via scrypt + AES-256-GCM → initializes WDK instance in RAM → starts per-wallet TTL timer
2. **Request**: CLI/MCP sends operation (e.g. `get_address`) with wallet name over Unix socket → daemon performs crypto operation → returns result only
3. **Lock**: Individual wallet locked → WDK instance disposed and cleared. When last wallet locks → daemon exits

### Encrypted wallet files

Each wallet is stored in its own directory as `~/.config/wdk-cli/wallets/<name>/seed.enc`:

```json
{ "version": 1, "salt": "...", "iv": "...", "tag": "...", "ciphertext": "..." }
```

Per-wallet password with unique random salt → unique derived key per wallet.

## AI Agent Integration

AI agents interact with wdk-wallet in two ways, depending on their environment:

### MCP — for sandboxed AI models

For AI models that run as applications with limited system access (Claude Desktop, ChatGPT Desktop, etc.). The model can only interact with the wallet through structured MCP tools — it cannot run commands or access the filesystem.

```bash
wdk setup claude-desktop    # Claude Desktop
wdk setup claude-code       # Claude Code
wdk setup chatgpt           # ChatGPT Desktop
wdk setup openclaw          # OpenClaw
```

Each command auto-detects the Node.js path, validates prerequisites, and writes the config. Use `--remove` to uninstall.

**MCP Tools:** `get_networks`, `get_address`, `get_balance`, `get_history`, `send_token`

All wallet-dependent tools accept an optional `wallet` parameter (uses default wallet if omitted).

### CLI — for local AI agents

For AI agents with full system access (Claude Code, OpenClaw, custom agents). The agent runs `wdk` commands directly with `--json` for machine-parseable output.

```bash
wdk get balance --network ethereum --json
wdk send --to 0xRECIPIENT --amount 1000000 --network ethereum --dry-run
wdk send --to 0xRECIPIENT --amount 1000000 --network ethereum --json --yes
```

The `wdk-wallet/SKILL.md` file contains complete instructions for AI agents — commands, workflows, error handling, and amount conversions. Feed it as context to your agent.

### Before using either mode

Create and unlock wallets first:
```bash
wdk wallet create --name default --words 24
wdk wallet unlock --name default --ttl 0
```

Both MCP and CLI route through the daemon — the agent never has access to keys or seeds.

## Development

```bash
npm run build          # Build
npm run dev            # Build in watch mode
npm test               # Run tests
npm run test:coverage  # Run tests with coverage
npm run lint           # Lint (check only)
npm run lint:fix       # Lint and auto-fix
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For support, please open an issue on the GitHub repository.

