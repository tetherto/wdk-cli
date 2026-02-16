# wdk-cli

A TypeScript CLI tool that wraps [Tether's Wallet Development Kit (WDK)](https://wallet.tether.io/) for multi-chain wallet operations.

## Features

- **Wallet Management** — Generate or import BIP-39 seed phrases, encrypted at rest with AES-256-GCM
- **Multi-Chain Wallets** — Bitcoin, Ethereum, Polygon, Arbitrum, BSC, Avalanche, Solana + testnets + custom networks
- **Balance Checking** — Native tokens and ERC-20 token balances with address display
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
# Create a new wallet
wdk wallet create --words 24

# Unlock wallet session (skip password prompts)
wdk wallet unlock

# Derive wallet address on Ethereum
wdk get address --network ethereum

# Check balance (shows address + balance)
wdk get balance --network ethereum

# Send ETH (amount in wei)
wdk send --to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 --amount 1000000000000000000 --network ethereum

# List supported networks
wdk network list

# Use testnet for development
wdk get address --network sepolia
wdk get balance --network sepolia

# Lock wallet when done
wdk wallet lock
```

## Commands

### Wallet

```bash
wdk wallet create [--words 12|24]       # Generate new BIP-39 seed phrase
wdk wallet import                       # Import existing seed phrase (interactive)
wdk wallet export                       # Export seed phrase (decrypt and display)
wdk wallet unlock [--ttl <minutes>]     # Unlock wallet session (default: 30 min)
wdk wallet lock                         # Lock wallet and end session
```

Seed phrases are encrypted with AES-256-GCM (scrypt KDF) and stored in `~/.config/wdk-cli/keyring.enc`. The password is prompted interactively and never stored.

If a wallet already exists, `create` and `import` will ask for confirmation before overwriting.

Unlock your wallet once with `wdk wallet unlock` to skip the password prompt on subsequent commands. The session auto-expires after 30 minutes (configurable with `--ttl`).

### Networks

```bash
wdk network list              # List all networks (built-in + custom)
wdk network list --testnet    # Show only testnets
wdk network list --mainnet    # Show only mainnets
wdk network list --json       # Machine-readable output
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
| `--wallet-type <type>` | Yes | `wdk-wallet-evm`, `wdk-wallet-btc`, or `wdk-wallet-solana` |
| `--symbol <symbol>` | Yes | Native token symbol (e.g. `ETH`) |
| `--decimals <n>` | No | Token decimals (default: 18 for EVM, 8 for BTC, 9 for Solana) |
| `--testnet` | No | Mark as testnet |

Custom networks are stored in config and work with all commands (`get balance`, `send`, `get address`, etc.). After creating a network, use `wdk config set` to configure network settings.

### Get

```bash
wdk get address --network <network> [--index <n>]              # Derive wallet address
wdk get balance --network ethereum                              # Native ETH balance (shows address + balance)
wdk get balance --network ethereum --token 0xdAC17F...          # ERC-20 token balance
wdk get balance --network bitcoin                               # BTC balance
wdk get network --network ethereum                              # Show network details and config
```

Wallets are derived deterministically from your seed phrase using BIP-44 HD paths — no local state is stored. `get address` works without a provider configured (local derivation only), while `get balance` requires a provider connection.

### Send

```bash
wdk send --to <address> --amount <base-units> --network <network>
wdk send --to <address> --amount <base-units> --network ethereum --token <contract>
wdk send --to <address> --amount <base-units> --network ethereum --yes  # skip confirmation
```

Amounts are in base units (wei for EVM, satoshis for BTC, lamports for Solana). Fee estimation runs before confirmation.

### Configuration

```bash
wdk config list                                                     # Show all config
wdk config get                                                      # Show global settings
wdk config get --network ethereum                                   # Show Ethereum config
wdk config set provider <rpc-url> --network ethereum                # Custom RPC for Ethereum
wdk config set transferMaxFee 50000000000 --network ethereum        # Max fee for Ethereum
wdk config reset provider --network ethereum                        # Reset to default
wdk config path                                                     # Config file location
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

### Built-in

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

Additional networks can be added with `wdk network create`. See [Adding Custom Networks](#adding-custom-networks).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WDK_PASSWORD` | Wallet unlock password (skip interactive prompt) |
| `WDK_PROVIDER_<NETWORK>` | Provider URL override (e.g. `WDK_PROVIDER_ETHEREUM`, `WDK_PROVIDER_BITCOIN`) |
| `WDK_INDEXER_BASE_URL` | WDK Indexer API URL |
| `WDK_INDEXER_API_KEY` | WDK Indexer API key |

## Security

- Seed phrases are **encrypted at rest** using AES-256-GCM with scrypt key derivation
- Seed phrases are **never accepted as CLI arguments** — only via interactive prompt
- Passwords are **never stored** — prompted each time (or use `wdk wallet unlock` for sessions)
- Wallet sessions are **encrypted** and **auto-expire** after 30 minutes
- **Confirmation required** before overwriting an existing wallet or sending transactions
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
