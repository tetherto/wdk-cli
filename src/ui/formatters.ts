import chalk from 'chalk'
import { getNetworkConfig, isBuiltinNetwork } from '../config/networks.js'
import type { NetworkName, NetworkType } from '../types/index.js'

export const TYPE_LABELS: Record<NetworkType, { label: string; color: (t: string) => string }> = {
  'wdk-wallet-evm': { label: 'EVM', color: chalk.cyan },
  'wdk-wallet-btc': { label: 'BTC', color: chalk.yellow },
  'wdk-wallet-solana': { label: 'SOL', color: chalk.magenta },
  'wdk-wallet-spark': { label: 'SPARK', color: chalk.hex('#FF9500') },
  'wdk-wallet-evm-erc-4337': { label: '4337', color: chalk.hex('#4FC08D') },
  'wdk-wallet-tron': { label: 'TRX', color: chalk.hex('#FF0013') },
}

export function formatBalance(rawBalance: string | number, network: string): string {
  const config = getNetworkConfig(network)
  const raw = BigInt(rawBalance.toString())
  const divisor = 10n ** BigInt(config.decimals)
  const whole = raw / divisor
  const remainder = raw % divisor
  const decimal = remainder.toString().padStart(config.decimals, '0').replace(/0+$/, '') || '0'

  const trimmed = decimal.slice(0, 8)
  return `${whole}.${trimmed} ${config.nativeSymbol}`
}

export function formatAmount(raw: bigint, decimals: number, symbol: string): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const remainder = raw % divisor
  if (remainder === 0n) return `${whole} ${symbol}`
  const decimal = remainder.toString().padStart(decimals, '0').replace(/0+$/, '')
  const trimmed = decimal.slice(0, 8)
  return `${whole}.${trimmed} ${symbol}`
}

export function formatAddress(address: string, truncate: boolean = false): string {
  if (!truncate || address.length <= 16) return address
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

export function formatTxHash(hash: string, truncate: boolean = true): string {
  if (!truncate || hash.length <= 16) return hash
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

export function formatNetworkLabel(network: string): string {
  const config = getNetworkConfig(network)
  return `${config.displayName} (${config.nativeSymbol})`
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString()
}

const BUILTIN_COLORS: Record<NetworkName, (text: string) => string> = {
  bitcoin: chalk.hex('#F7931A'),
  'bitcoin-testnet3': chalk.hex('#F7931A'),
  ethereum: chalk.hex('#627EEA'),
  sepolia: chalk.hex('#627EEA'),
  polygon: chalk.hex('#8247E5'),
  arbitrum: chalk.hex('#28A0F0'),
  base: chalk.hex('#0052FF'),
  bsc: chalk.hex('#F0B90B'),
  avalanche: chalk.hex('#E84142'),
  solana: chalk.hex('#9945FF'),
  'solana-testnet': chalk.hex('#9945FF'),
  'solana-devnet': chalk.hex('#9945FF'),
  spark: chalk.hex('#FF9500'),
  'spark-regtest': chalk.hex('#FF9500'),
  tron: chalk.hex('#FF0013'),
  'tron-testnet': chalk.hex('#FF0013'),
  'smart-account-ethereum': chalk.hex('#4FC08D'),
  'smart-account-sepolia': chalk.hex('#4FC08D'),
  'smart-account-polygon': chalk.hex('#4FC08D'),
  'smart-account-arbitrum': chalk.hex('#4FC08D'),
  'smart-account-base': chalk.hex('#4FC08D'),
  'smart-account-plasma': chalk.hex('#4FC08D'),
}

export function networkColor(network: string): (text: string) => string {
  if (isBuiltinNetwork(network)) {
    return BUILTIN_COLORS[network] || chalk.white
  }
  const config = getNetworkConfig(network)
  if (!config) return chalk.white
  const typeLabel = TYPE_LABELS[config.type]
  return typeLabel ? typeLabel.color : chalk.white
}
