import type { ChainName, ChainConfig } from '../types/index.js'

export const CHAINS: Record<ChainName, ChainConfig> = {
  bitcoin: {
    name: 'bitcoin',
    displayName: 'Bitcoin',
    type: 'btc',
    defaultProvider: 'https://blockstream.info/api',
    nativeSymbol: 'BTC',
    decimals: 8,
  },
  'bitcoin-testnet': {
    name: 'bitcoin-testnet',
    displayName: 'Bitcoin Testnet',
    type: 'btc',
    defaultProvider: 'https://blockstream.info/testnet/api',
    nativeSymbol: 'tBTC',
    decimals: 8,
  },
  ethereum: {
    name: 'ethereum',
    displayName: 'Ethereum',
    type: 'evm',
    defaultProvider: 'https://eth.drpc.org',
    nativeSymbol: 'ETH',
    decimals: 18,
  },
  sepolia: {
    name: 'sepolia',
    displayName: 'Sepolia Testnet',
    type: 'evm',
    defaultProvider: 'https://ethereum-sepolia-rpc.publicnode.com',
    nativeSymbol: 'ETH',
    decimals: 18,
  },
  polygon: {
    name: 'polygon',
    displayName: 'Polygon',
    type: 'evm',
    defaultProvider: 'https://polygon-rpc.com',
    nativeSymbol: 'POL',
    decimals: 18,
  },
  arbitrum: {
    name: 'arbitrum',
    displayName: 'Arbitrum One',
    type: 'evm',
    defaultProvider: 'https://arb1.arbitrum.io/rpc',
    nativeSymbol: 'ETH',
    decimals: 18,
  },
  bsc: {
    name: 'bsc',
    displayName: 'BNB Smart Chain',
    type: 'evm',
    defaultProvider: 'https://bsc-dataseed.binance.org',
    nativeSymbol: 'BNB',
    decimals: 18,
  },
  avalanche: {
    name: 'avalanche',
    displayName: 'Avalanche C-Chain',
    type: 'evm',
    defaultProvider: 'https://api.avax.network/ext/bc/C/rpc',
    nativeSymbol: 'AVAX',
    decimals: 18,
  },
}

export const CHAIN_NAMES = Object.keys(CHAINS) as ChainName[]

export function getChainConfig(name: ChainName): ChainConfig {
  return CHAINS[name]
}

export function isEvmChain(name: ChainName): boolean {
  return CHAINS[name].type === 'evm'
}

export function isBtcChain(name: ChainName): boolean {
  return CHAINS[name].type === 'btc'
}

export function isValidChain(name: string): name is ChainName {
  return name in CHAINS
}

export function isTestnet(name: ChainName): boolean {
  return name === 'bitcoin-testnet' || name === 'sepolia'
}
