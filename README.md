# wdk-cli

A TypeScript CLI tool that wraps [Tether's Wallet Development Kit (WDK)](https://wallet.tether.io/) for multi-chain wallet operations.

## Features

- **Key Management** — Generate or import BIP-39 seed phrases, encrypted at rest with AES-256-GCM
- **Multi-Chain Wallets** — Bitcoin, Ethereum, Polygon, Arbitrum, BSC, Avalanche, Solana + testnets
- **Balance Checking** — Native tokens and ERC-20 token balances
- **Send Transactions** — Native and token transfers with fee estimation and confirmation
- **Wallet Sessions** — Unlock once, skip password on subsequent commands
- **Configuration** — Per-network RPC providers, env var overrides, XDG-compliant config

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

# Unlock wallet session (skip password prompts)
wdk wallet unlock

# Derive wallet address on Ethereum
wdk wallet address --network ethereum

# Check balance
wdk balance --network ethereum

# Send ETH (amount in wei)
wdk send --to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 --amount 1000000000000000000 --network ethereum

# List supported networks
wdk networks

# Use testnet for development
wdk wallet address --network sepolia
wdk balance --network sepolia

# Lock wallet when done
wdk wallet lock
```

## Commands

### Key Management

```bash
wdk key generate [--words 12|24]   # Generate new BIP-39 seed phrase
wdk key import                     # Import existing seed phrase (interactive)
wdk key status                     # Check if a key is stored
```

Seed phrases are encrypted with AES-256-GCM (scrypt KDF) and stored in `~/.config/wdk-cli/keyring.enc`. The password is prompted interactively and never stored.

### Networks

```bash
wdk networks                  # List all supported networks
wdk networks --testnet        # Show only testnets
wdk networks --mainnet        # Show only mainnets
wdk networks --json           # Machine-readable output
```

### Wallet Operations

```bash
wdk wallet unlock [--ttl <minutes>]                    # Unlock wallet session (default: 30 min)
wdk wallet lock                                        # Lock wallet and end session
wdk wallet address --network <network> [--index <n>]   # Derive wallet address
wdk wallet info --network <network> [--index <n>]      # Show address + balance
```

Wallets are derived deterministically from your seed phrase using BIP-44 HD paths — no local state is stored.

Unlock your wallet once with `wdk wallet unlock` to skip the password prompt on subsequent commands. The session auto-expires after 30 minutes (configurable with `--ttl`).

### Balance

```bash
wdk balance --network ethereum                         # Native ETH balance
wdk balance --network ethereum --token 0xdAC17F...     # ERC-20 token balance
wdk balance --network bitcoin                          # BTC balance
```

### Send

```bash
wdk send --to <address> --amount <base-units> --network <network>
wdk send --to <address> --amount <base-units> --network ethereum --token <contract>
wdk send --to <address> --amount <base-units> --network ethereum --yes  # skip confirmation
```

Amounts are in base units (wei for EVM, satoshis for BTC, lamports for Solana). Fee estimation runs before confirmation.

### Configuration

```bash
wdk config set defaultNetwork polygon          # Set default network
wdk config set providers.ethereum <rpc-url>    # Custom RPC provider
wdk config get defaultNetwork                  # Read a config value
wdk config list                                # Show all config
wdk config path                                # Show config file location
```

### Global Flags

| Flag | Description |
|------|-------------|
| `--network <network>` | Override default network |
| `--index <n>` | Account index (default: 0) |
| `--json` | Machine-readable JSON output |
| `--no-color` | Disable colored output |
| `--verbose` | Debug logging |

## Supported Networks

| Network | Name | Type | Native Symbol |
|---------|------|------|---------------|
| `bitcoin` | Bitcoin | BTC | BTC |
| `bitcoin-testnet` | Bitcoin Testnet | BTC | tBTC |
| `bitcoin-signet` | Bitcoin Signet | BTC | sBTC |
| `ethereum` | Ethereum | EVM | ETH |
| `sepolia` | Sepolia Testnet | EVM | ETH |
| `polygon` | Polygon | EVM | POL |
| `arbitrum` | Arbitrum One | EVM | ETH |
| `bsc` | BNB Smart Chain | EVM | BNB |
| `avalanche` | Avalanche C-Chain | EVM | AVAX |
| `solana` | Solana | Solana | SOL |
| `solana-testnet` | Solana Testnet | Solana | SOL |
| `solana-devnet` | Solana Devnet | Solana | SOL |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WDK_PASSWORD` | Wallet unlock password (skip interactive prompt) |
| `WDK_DEFAULT_NETWORK` | Override default network |
| `WDK_PROVIDER_ETHEREUM` | Ethereum RPC URL |
| `WDK_PROVIDER_BITCOIN` | Bitcoin API URL |
| `WDK_PROVIDER_<NETWORK>` | Any network provider URL |
| `WDK_INDEXER_BASE_URL` | WDK Indexer API URL |
| `WDK_INDEXER_API_KEY` | WDK Indexer API key |

## Security

- Seed phrases are **encrypted at rest** using AES-256-GCM with scrypt key derivation
- Seed phrases are **never accepted as CLI arguments** — only via interactive prompt
- Passwords are **never stored** — prompted each time (or use `wdk wallet unlock` for sessions)
- Wallet sessions are **encrypted** and **auto-expire** after 30 minutes
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
