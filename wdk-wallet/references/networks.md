# Supported Networks & Tokens

## Networks

| Network | Name | Native Symbol | Decimals |
|---------|------|---------------|----------|
| `bitcoin` | Bitcoin | BTC | 8 |
| `bitcoin-testnet3` | Bitcoin Testnet3 | tBTC | 8 |
| `ethereum` | Ethereum | ETH | 18 |
| `sepolia` | Sepolia Testnet | ETH | 18 |
| `polygon` | Polygon | POL | 18 |
| `arbitrum` | Arbitrum One | ETH | 18 |
| `base` | Base | ETH | 18 |
| `bsc` | BNB Smart Chain | BNB | 18 |
| `avalanche` | Avalanche C-Chain | AVAX | 18 |
| `solana` | Solana | SOL | 9 |
| `solana-testnet` | Solana Testnet | SOL | 9 |
| `solana-devnet` | Solana Devnet | SOL | 9 |
| `spark` | Spark | BTC | 8 |
| `spark-regtest` | Spark Regtest | BTC | 8 |
| `tron` | Tron | TRX | 6 |
| `tron-testnet` | Tron Testnet (Shasta) | TRX | 6 |
| `smart-account-ethereum` | Smart Account Ethereum | ETH | 18 |
| `smart-account-sepolia` | Smart Account Sepolia | ETH | 18 |
| `smart-account-polygon` | Smart Account Polygon | POL | 18 |
| `smart-account-arbitrum` | Smart Account Arbitrum | ETH | 18 |
| `smart-account-base` | Smart Account Base | ETH | 18 |
| `smart-account-plasma` | Smart Account Plasma | ETH | 18 |

## USDT Token Addresses

| Network | Address | Decimals |
|---------|---------|----------|
| `ethereum` | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 |
| `sepolia` | `0xd077A400968890Eacc75cdc901F0356c943e4fDb` | 6 |
| `polygon` | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | 6 |
| `arbitrum` | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` | 6 |
| `base` | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` | 6 |
| `bsc` | `0x55d398326f99059fF775485246999027B3197955` | 18 |
| `avalanche` | `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7` | 6 |
| `solana` | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 |
| `tron` | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 |

## XAUT Token Addresses

| Network | Address | Decimals |
|---------|---------|----------|
| `ethereum` | `0x68749665FF8D2d112Fa859AA293F07A622782F38` | 6 |

## Custom Networks

Users can add custom networks:

```bash
wdk network create --name base --display-name "Base Mainnet" --wallet-type wdk-wallet-evm --symbol ETH
wdk config set provider https://mainnet.base.org --network base
```

List all networks: `wdk network list --json`
