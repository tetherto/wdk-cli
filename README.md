# wdk-cli

A TypeScript CLI tool that wraps [Tether's Wallet Development Kit (WDK)](https://wallet.tether.io/) for multi-chain wallet operations.

## Features

- **Key Management** — Generate or import BIP-39 seed phrases, encrypted at rest with AES-256-GCM
- **Multi-Chain Wallets** — Bitcoin, Ethereum, Polygon, Arbitrum, BSC, Avalanche + testnets
- **Balance Checking** — Native tokens and ERC-20 token balances
- **Send Transactions** — Native and token transfers with fee estimation and confirmation
- **Configuration** — Per-chain RPC providers, env var overrides, XDG-compliant config

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
# Generate a new wallet
wdk key generate --words 24

# Create a wallet on Ethereum
wdk wallet create --chain ethereum

# Check balance
wdk balance --chain ethereum

# Send ETH (amount in wei)
wdk send --to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 --amount 1000000000000000000 --chain ethereum

# Use testnet for development
wdk wallet create --chain sepolia
wdk balance --chain sepolia
```

## Commands

### Key Management

```bash
wdk key generate [--words 12|24]   # Generate new BIP-39 seed phrase
wdk key import                     # Import existing seed phrase (interactive)
wdk key status                     # Check if a key is stored
```

Seed phrases are encrypted with AES-256-GCM (scrypt KDF) and stored in `~/.config/wdk-cli/keyring.enc`. The password is prompted interactively and never stored.

### Wallet Operations

```bash
wdk wallet create --chain <chain> [--index <n>]   # Derive wallet
wdk wallet list [--chain <chain>]                  # List all wallets
wdk wallet info --chain <chain> [--index <n>]      # Show address + balance
```

### Balance

```bash
wdk balance --chain ethereum                         # Native ETH balance
wdk balance --chain ethereum --token 0xdAC17F...     # ERC-20 token balance
wdk balance --chain bitcoin                          # BTC balance
```

### Send

```bash
wdk send --to <address> --amount <base-units> --chain <chain>
wdk send --to <address> --amount <base-units> --chain ethereum --token <contract>
wdk send --to <address> --amount <base-units> --chain ethereum --yes  # skip confirmation
```

Amounts are in base units (wei for EVM, satoshis for BTC). Fee estimation runs before confirmation.

### Configuration

```bash
wdk config set defaultChain polygon          # Set default chain
wdk config set providers.ethereum <rpc-url>  # Custom RPC provider
wdk config get defaultChain                  # Read a config value
wdk config list                              # Show all config
wdk config path                              # Show config file location
```

### Global Flags

| Flag | Description |
|------|-------------|
| `--chain <chain>` | Override default chain |
| `--index <n>` | Account index (default: 0) |
| `--json` | Machine-readable JSON output |
| `--no-color` | Disable colored output |
| `--verbose` | Debug logging |

## Supported Chains

| Chain | Name | Type | Native Symbol |
|-------|------|------|---------------|
| `bitcoin` | Bitcoin | BTC | BTC |
| `bitcoin-testnet` | Bitcoin Testnet | BTC | tBTC |
| `ethereum` | Ethereum | EVM | ETH |
| `sepolia` | Sepolia Testnet | EVM | ETH |
| `polygon` | Polygon | EVM | POL |
| `arbitrum` | Arbitrum One | EVM | ETH |
| `bsc` | BNB Smart Chain | EVM | BNB |
| `avalanche` | Avalanche C-Chain | EVM | AVAX |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WDK_DEFAULT_CHAIN` | Override default chain |
| `WDK_PROVIDER_ETHEREUM` | Ethereum RPC URL |
| `WDK_PROVIDER_BITCOIN` | Bitcoin API URL |
| `WDK_PROVIDER_<CHAIN>` | Any chain provider URL |
| `WDK_INDEXER_BASE_URL` | WDK Indexer API URL |
| `WDK_INDEXER_API_KEY` | WDK Indexer API key |

## Security

- Seed phrases are **encrypted at rest** using AES-256-GCM with scrypt key derivation
- Seed phrases are **never accepted as CLI arguments** — only via interactive prompt
- Passwords are **never stored** — prompted each time
- **Confirmation required** before every send transaction (unless `--yes`)
- No telemetry, no analytics, no data sent to external services

## Development

```bash
npm run build          # Build
npm run dev            # Build in watch mode
npm test               # Run tests
npm run test:coverage  # Run tests with coverage
npm run lint           # Lint
```

## License

Apache-2.0
