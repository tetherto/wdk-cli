import chalk from 'chalk'
import { getNetworkConfig } from '../config/networks.js'

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

