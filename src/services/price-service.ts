import { getNetworkConfig } from '../config/networks.js'
import { getTokenConfig } from '../config/tokens.js'
import type { NetworkName } from '../types/index.js'

const NATIVE_SYMBOLS: Record<string, string> = {
  BTC: 'tBTCUSD',
  tBTC: 'tBTCUSD',
  ETH: 'tETHUSD',
  SOL: 'tSOLUSD',
  TRX: 'tTRXUSD',
  BNB: 'tBNBUSD',
  AVAX: 'tAVAXUSD',
  POL: 'tMATICUSD',
}

const TOKEN_SYMBOLS: Record<string, string> = {
  USDT: 'tUSTUSD',
  XAUT: 'tXAUTUSD',
}

interface PriceCache {
  prices: Map<string, number>
  timestamp: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
let cache: PriceCache | null = null

function getAllBitfinexSymbols(): string[] {
  const symbols = new Set<string>()
  for (const sym of Object.values(NATIVE_SYMBOLS)) symbols.add(sym)
  for (const sym of Object.values(TOKEN_SYMBOLS)) symbols.add(sym)
  return [...symbols]
}

async function fetchPrices(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.prices
  }

  const symbols = getAllBitfinexSymbols()
  const url = `https://api-pub.bitfinex.com/v2/tickers?symbols=${symbols.join(',')}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Bitfinex API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as number[][]
  const prices = new Map<string, number>()

  for (const ticker of data) {
    const symbol = ticker[0] as unknown as string
    const lastPrice = ticker[7] as number
    prices.set(symbol, lastPrice)
  }

  cache = { prices, timestamp: Date.now() }
  return prices
}

export async function getNativeUsdPrice(network: NetworkName): Promise<number> {
  const config = getNetworkConfig(network)
  const bitfinexSymbol = NATIVE_SYMBOLS[config.nativeSymbol]
  if (!bitfinexSymbol) {
    throw new Error(`No USD price available for native token ${config.nativeSymbol} on ${network}.`)
  }

  const prices = await fetchPrices()
  const price = prices.get(bitfinexSymbol)
  if (!price) {
    throw new Error(`Failed to fetch USD price for ${config.nativeSymbol}.`)
  }
  return price
}

export async function getTokenUsdPrice(network: NetworkName, tokenAddress: string): Promise<number> {
  const tokenConfig = getTokenConfig(network, tokenAddress)
  if (!tokenConfig) {
    throw new Error(
      `Unknown token ${tokenAddress} on ${network}. Cannot determine USD value.\n` +
      `Policy requires USD conversion for spending limits.`,
    )
  }

  const bitfinexSymbol = TOKEN_SYMBOLS[tokenConfig.symbol]
  if (!bitfinexSymbol) {
    throw new Error(
      `No USD price available for token ${tokenConfig.symbol} on ${network}.`,
    )
  }

  const prices = await fetchPrices()
  const price = prices.get(bitfinexSymbol)
  if (!price) {
    throw new Error(`Failed to fetch USD price for ${tokenConfig.symbol}.`)
  }
  return price
}

export async function convertToUsd(
  network: NetworkName,
  amount: bigint,
  tokenAddress?: string,
): Promise<number> {
  if (tokenAddress) {
    const tokenConfig = getTokenConfig(network, tokenAddress)
    if (!tokenConfig) {
      throw new Error(
        `Unknown token ${tokenAddress} on ${network}. Cannot determine USD value.\n` +
        `Policy requires USD conversion for spending limits.`,
      )
    }
    const price = await getTokenUsdPrice(network, tokenAddress)
    const decimals = tokenConfig.decimals
    const value = Number(amount) / 10 ** decimals
    return value * price
  } else {
    const config = getNetworkConfig(network)
    const price = await getNativeUsdPrice(network)
    const value = Number(amount) / 10 ** config.decimals
    return value * price
  }
}
