import chalk from 'chalk'
import type { ChainName } from '../types/index.js'
import { CHAINS } from '../config/chains.js'

export function formatBalance(rawBalance: string | number, chain: ChainName): string {
  const config = CHAINS[chain]
  const raw = BigInt(rawBalance.toString())
  const divisor = BigInt(10 ** config.decimals)
  const whole = raw / divisor
  const remainder = raw % divisor
  const decimal = remainder.toString().padStart(config.decimals, '0').replace(/0+$/, '') || '0'

  // Show up to 8 decimal places
  const trimmed = decimal.slice(0, 8)
  return `${whole}.${trimmed} ${config.nativeSymbol}`
}

export function formatAddress(address: string, truncate: boolean = false): string {
  if (!truncate || address.length <= 16) return address
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

export function formatTxHash(hash: string, truncate: boolean = true): string {
  if (!truncate || hash.length <= 16) return hash
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

export function formatChainLabel(chain: ChainName): string {
  const config = CHAINS[chain]
  return `${config.displayName} (${config.nativeSymbol})`
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString()
}

export function chainColor(chain: ChainName): (text: string) => string {
  const colors: Record<ChainName, (text: string) => string> = {
    bitcoin: chalk.hex('#F7931A'),
    ethereum: chalk.hex('#627EEA'),
    polygon: chalk.hex('#8247E5'),
    arbitrum: chalk.hex('#28A0F0'),
    bsc: chalk.hex('#F0B90B'),
    avalanche: chalk.hex('#E84142'),
  }
  return colors[chain] || chalk.white
}
