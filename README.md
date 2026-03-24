# wdk-cli

A multi-chain crypto wallet for AI agents, built on [Wallet Development Kit (WDK)](https://wallet.tether.io/). Designed to be operated by AI agents (e.g. Claude, ChatGPT, OpenClaw) with user-controlled spending policies.

## Architecture

```
┌───────────┐        ┌───────────────────────────────────┐
│  wdk-cli  │──IPC──▶│          wdk-daemon               │
│  (CLI)    │        │        (wallet daemon)             │
└───────────┘        │                                   │
                     │  Holds WDK instances in memory    │
┌───────────┐        │  Handles all crypto operations:   │
│  wdk-mcp  │──IPC──▶│  derivation, signing, balances    │
│  (MCP)    │        │  Auto-exits after timeout         │
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
- Holds WDK instances in memory — owns all cryptographic operations
- Enforces spending policies (limits, whitelist) before executing transactions
- Listens on a Unix socket (`daemon.sock`, 0600 permissions)
- Exposes: `get_address`, `get_balance`, `get_history`, `estimate_fee`, `send`, `list_wallets`, `status`, `lock`
- Auto-exits after configurable timeout (default: 30 min, `--ttl 0` for unlimited)
- Clients send requests → daemon enforces policy → performs crypto → returns results

**wdk-cli** (CLI):
- Thin client — no crypto, no keys
- Parses user commands, sends requests to daemon, formats and displays results
- Only interface for password-protected operations: unlock wallet, export seed, manage spending policies, delete wallet

**wdk-mcp** (MCP Server):
- Thin client — no crypto, no keys
- Exposes structured wallet tools to AI agents via [Model Context Protocol](https://modelcontextprotocol.io/)
- Routes all operations through the daemon

## Features

- **Wallet** — Multiple named wallets with BIP-39 seed phrases, encrypted at rest with AES-256-GCM. Background daemon holds keys in memory after unlock
- **Network** — Bitcoin, Ethereum, Polygon, Arbitrum, Base, BSC, Avalanche, Solana, Tron, Spark, Smart Account (ERC-4337) + testnets. Add custom networks with `network create`
- **Get** — Derive wallet addresses, check balances, and view transaction history across all networks
- **Send** — Native and token transfers with fee estimation, confirmation, and dry-run preview
- **Policy** — Spending limits and address whitelists enforced at the daemon level. Policy changes require user password — AI agents cannot modify policies
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
# Create a new wallet
wdk wallet create --words 24

# Create additional named wallets
wdk wallet create --name trading --words 24
wdk wallet create --name savings --words 12

# List all wallets
wdk wallet list

# Unlock all wallets (starts background daemon, default: 30 min timeout)
wdk wallet unlock --ttl 0

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

# Use testnet for development
wdk get address --network sepolia
wdk get balance --network sepolia

# Lock all wallets when done
wdk wallet lock
```

## Commands

### Wallet

```bash
wdk wallet create [--words 12|24] [--name <name>]  # Generate new BIP-39 seed phrase
wdk wallet import [--name <name>]                   # Import existing seed phrase (interactive)
wdk wallet export [--name <name>]                   # Export seed phrase (decrypt and display)
wdk wallet list                                     # List all wallets with lock status
wdk wallet delete <name>                            # Delete a wallet (requires password)
wdk wallet unlock [--ttl <minutes>]                 # Unlock all wallets (starts daemon)
wdk wallet lock                                     # Lock all wallets (stops daemon)
```

Supports **multiple named wallets**, each stored as an independently encrypted file in `~/.config/wdk-cli/wallets/`. If `--name` is omitted, the wallet is named `"default"`. Use `--wallet <name>` on any command to target a specific wallet.

`wdk wallet unlock` starts the daemon with all wallets unlocked at once. Use `--ttl 0` for unlimited timeout — ideal for AI agent environments.

### Networks

```bash
wdk network list              # List all networks (built-in + custom)
wdk network list --testnet    # Show only testnets
wdk network list --mainnet    # Show only mainnets
wdk network info --network <network>  # Show network details and config
wdk network delete <name>     # Delete a custom network
```

#### Adding Custom Networks

Use `wdk network create` to define the network identity, then `wdk config set` to configure the provider:

```bash
# 1. Create the network
wdk network create \
  --name base \
  --display-name "Base Mainnet" \
  --wallet-type wdk-wallet-evm \
  --symbol ETH

# 2. Configure the provider
wdk config set provider https://mainnet.base.org --network base
```

| Flag | Required | Description |
|------|----------|-------------|
| `--name <name>` | Yes | Network identifier (lowercase, e.g. `base`) |
| `--display-name <name>` | Yes | Human-readable name (e.g. `Base Mainnet`) |
| `--wallet-type <type>` | Yes | `wdk-wallet-evm`, `wdk-wallet-btc`, `wdk-wallet-solana`, `wdk-wallet-spark`, `wdk-wallet-tron`, `wdk-wallet-evm-erc-4337` |
| `--symbol <symbol>` | Yes | Native token symbol (e.g. `ETH`) |
| `--decimals <n>` | No | Token decimals (default: 18 for EVM, 8 for BTC/Spark, 9 for Solana, 6 for Tron) |
| `--testnet` | No | Mark as testnet |

Custom networks are stored in config and work with all commands (`get balance`, `send`, `get address`, etc.). After creating a network, use `wdk config set` to configure network settings.

### Get

```bash
wdk get address --network <network> [--index <n>]              # Derive wallet address
wdk get address                                                 # All mainnet addresses
wdk get address --testnet                                       # All testnet addresses
wdk get balance --network ethereum                              # Native ETH balance
wdk get balance --network ethereum --token 0xdAC17F...          # ERC-20 token balance
wdk get balance                                                 # All mainnet balances with USD
wdk get balance --testnet                                       # All testnet balances with USD
wdk get history --network ethereum                               # USDT transfer history
wdk get history --network ethereum --token xaut --limit 50       # XAUT transfers, last 50
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

### Policy

Spending policies protect against unauthorized or excessive transactions — designed for environments where AI agents interact with the wallet.

```bash
wdk policy show                              # Show policy settings and daily spending
wdk policy set enabled true                  # Enable policy enforcement
wdk policy set enabled false                 # Disable policy enforcement
wdk policy set maxPerCallUsd 100             # Max $100 per transaction
wdk policy set maxPerDayUsd 1000             # Max $1000 per day
wdk policy set maxTxPerDay 50                # Max 50 transactions per day
wdk policy whitelist add <address>           # Allow only whitelisted addresses
wdk policy whitelist remove <address>        # Remove from whitelist
wdk policy whitelist list                    # List whitelisted addresses
```

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `false` | Enable/disable policy enforcement (true/false) |
| `maxPerCallUsd` | `0` (unlimited) | Max USD value per transaction (0 = unlimited) |
| `maxPerDayUsd` | `0` (unlimited) | Max total USD spent per day (0 = unlimited) |
| `maxTxPerDay` | `0` (unlimited) | Max number of transactions per day (0 = unlimited) |
| `whitelist` | empty (any address) | Only allow sending to listed addresses (empty = any) |

Policy changes **require wallet password confirmation** in an interactive terminal. AI agents cannot modify policies — even if running in a TTY, they cannot provide the wallet password. USD conversion uses Bitfinex price feeds. Transactions with unknown tokens are blocked when policy is enabled.

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

#### Network Configuration

| Network Type | Config Keys | Description |
|-------------|-------------|-------------|
| EVM | `provider`, `transferMaxFee` | JSON-RPC URL, max gas fee (wei) |
| Solana | `provider` | JSON-RPC URL |
| BTC | `host`, `port`, `protocol`, `network`, `bip` | Electrum server settings |
| Spark | `sparkNetwork`, `sparkScanApiKey` | Network (MAINNET/REGTEST), API key |
| Tron | `provider`, `transferMaxFee` | JSON-RPC URL, max fee (sun) |
| Smart Account | `chainId`, `provider`, `bundlerUrl`, `entryPointAddress`, `safeModulesVersion`, `mode`, `paymasterUrl`, `paymasterAddress`, `paymasterToken`, `transferMaxFee` | ERC-4337 account abstraction |

BTC networks use the [Electrum protocol](https://electrumx.readthedocs.io/). Default: `tcp` on standard ports. Set `protocol` to `tls` or `ssl` for encrypted connections. `bip` controls address type: `84` (native SegWit, default) or `44` (legacy P2PKH).

### Global Flags

| Flag | Description |
|------|-------------|
| `--network <network>` | Override default network |
| `--index <n>` | Account index (default: 0) |
| `--wallet <name>` | Wallet name (default: "default") |
| `--json` | Machine-readable JSON output |
| `--no-color` | Disable colored output |
| `--verbose` | Debug logging |

## Supported Networks

### Built-in

| Network | Name | Type | Native Symbol |
|---------|------|------|---------------|
| `bitcoin` | Bitcoin | wdk-wallet-btc | BTC |
| `bitcoin-testnet3` | Bitcoin Testnet3 | wdk-wallet-btc | tBTC |
| `ethereum` | Ethereum | wdk-wallet-evm | ETH |
| `sepolia` | Sepolia Testnet | wdk-wallet-evm | ETH |
| `polygon` | Polygon | wdk-wallet-evm | POL |
| `arbitrum` | Arbitrum One | wdk-wallet-evm | ETH |
| `base` | Base | wdk-wallet-evm | ETH |
| `bsc` | BNB Smart Chain | wdk-wallet-evm | BNB |
| `avalanche` | Avalanche C-Chain | wdk-wallet-evm | AVAX |
| `solana` | Solana | wdk-wallet-solana | SOL |
| `solana-testnet` | Solana Testnet | wdk-wallet-solana | SOL |
| `solana-devnet` | Solana Devnet | wdk-wallet-solana | SOL |
| `spark` | Spark | wdk-wallet-spark | BTC |
| `spark-regtest` | Spark Regtest | wdk-wallet-spark | BTC |
| `tron` | Tron | wdk-wallet-tron | TRX |
| `tron-testnet` | Tron Testnet (Shasta) | wdk-wallet-tron | TRX |
| `smart-account-ethereum` | Smart Account Ethereum | wdk-wallet-evm-erc-4337 | ETH |
| `smart-account-sepolia` | Smart Account Sepolia | wdk-wallet-evm-erc-4337 | ETH |
| `smart-account-polygon` | Smart Account Polygon | wdk-wallet-evm-erc-4337 | POL |
| `smart-account-arbitrum` | Smart Account Arbitrum | wdk-wallet-evm-erc-4337 | ETH |
| `smart-account-base` | Smart Account Base | wdk-wallet-evm-erc-4337 | ETH |
| `smart-account-plasma` | Smart Account Plasma | wdk-wallet-evm-erc-4337 | ETH |

Additional networks can be added with `wdk network create`. See [Adding Custom Networks](#adding-custom-networks).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WDK_PASSWORD` | Wallet unlock password (skip interactive prompt) |
| `WDK_PROVIDER_<NETWORK>` | Provider URL override (e.g. `WDK_PROVIDER_ETHEREUM`, `WDK_PROVIDER_BITCOIN`) |
| `WDK_INDEXER_BASE_URL` | WDK Indexer API URL |
| `WDK_INDEXER_API_KEY` | WDK Indexer API key |

## Security

- Seed phrases encrypted at rest (AES-256-GCM + scrypt), unique salt per wallet
- Seeds and passwords never accepted as CLI arguments
- Private keys and seeds never leave the daemon process
- Unix socket with 0600 permissions (same-user access only, like ssh-agent)
- No telemetry, no analytics, no external data collection

### Data flow

1. **Unlock**: User enters password → daemon decrypts seeds via scrypt + AES-256-GCM → initializes WDK instances in RAM → discards derived keys
2. **Request**: CLI/MCP sends operation (e.g. `get_address`) over Unix socket → daemon performs crypto operation → returns result only
3. **Lock**: WDK instances disposed and cleared → daemon exits

### Encrypted wallet files

Each wallet is stored as an independent `.enc` file in `~/.config/wdk-cli/wallets/`:

```json
{ "version": 1, "salt": "...", "iv": "...", "tag": "...", "ciphertext": "..." }
```

Same password, unique random salt per wallet → unique derived key per wallet.

## AI Agent Integration

AI agents can interact with wdk-wallet in two ways:

**MCP (Model Context Protocol)** — AI models call structured wallet tools directly. Supported by Claude Desktop, Claude Code, ChatGPT Desktop, and other MCP-compatible platforms.

**CLI with `--json`** — For agents that don't support MCP. Use `--json` for machine-parseable output and `--yes` to skip confirmation prompts.

Both modes route through the daemon — the agent never has access to keys or seeds.

### MCP Setup

One command to connect wdk-wallet to your AI platform:

```bash
wdk setup claude-desktop    # Claude Desktop
wdk setup claude-code       # Claude Code (global, works in all projects)
wdk setup chatgpt           # ChatGPT Desktop
wdk setup openclaw          # OpenClaw
```

Each command auto-detects the Node.js binary path, validates prerequisites, and writes the config. Use `--remove` to uninstall.

Before using wallet tools, unlock your wallet:
```bash
wdk wallet unlock --ttl 0
```

**MCP Tools:** `get_networks`, `get_address`, `get_balance`, `get_history`, `send_token`, `get_policy`

All wallet-dependent tools accept an optional `wallet` parameter to target a specific wallet (defaults to `"default"`).

### CLI Mode

```bash
wdk get balance --network ethereum --json
wdk send --to 0xRECIPIENT --amount 1000000 --network ethereum --dry-run
wdk send --to 0xRECIPIENT --amount 1000000 --network ethereum --json --yes
wdk policy show --json
```

### Skill File

The `wdk-wallet/SKILL.md` file contains complete instructions for any AI agent to operate the wallet — commands, workflows, error handling, and amount conversions. Feed it as context to your agent.

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

