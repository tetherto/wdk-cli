// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import BigNumber from 'bignumber.js'
import { getNetworkConfig } from '../config/networks.js'
import { getTokenConfig } from '../config/tokens.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/**
 * @typedef {Object} PriceCache
 * @property {Map<string, number>} prices - Map of Bitfinex symbol to USD price.
 * @property {number} timestamp - The Unix timestamp (ms) when the cache was populated.
 */

// Map native token symbols to Bitfinex trading pair.
// Testnet tokens (e.g. tBTC) map to their mainnet price pair.
const NATIVE_SYMBOLS = {
  BTC: 'tBTCUSD',
  tBTC: 'tBTCUSD',
  ETH: 'tETHUSD',
  SOL: 'tSOLUSD',
  TRX: 'tTRXUSD',
  BNB: 'tBNBUSD',
  AVAX: 'tAVAXUSD',
  POL: 'tMATICUSD',
  MATIC: 'tMATICUSD'
}

const TOKEN_SYMBOLS = {
  USDT: 'tUSTUSD',
  XAUT: 'tXAUTUSD'
}

const CACHE_TTL_MS = 5 * 60 * 1000
/** @type {PriceCache | null} */
let cache = null

/**
 * Collects all unique Bitfinex ticker symbols needed for price lookups.
 *
 * @returns {string[]} Array of Bitfinex symbol strings.
 */
function getAllBitfinexSymbols () {
  const symbols = new Set()
  for (const sym of Object.values(NATIVE_SYMBOLS)) symbols.add(sym)
  for (const sym of Object.values(TOKEN_SYMBOLS)) symbols.add(sym)
  return [...symbols]
}

/**
 * Fetches current USD prices from Bitfinex for all tracked symbols, with 5-minute cache.
 *
 * @returns {Promise<Map<string, number>>} Map of Bitfinex symbol to USD price.
 */
async function fetchPrices () {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.prices
  }

  const symbols = getAllBitfinexSymbols()
  const url = `https://api-pub.bitfinex.com/v2/tickers?symbols=${symbols.join(',')}`

  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) {
    throw new WdkCliError(
      `Bitfinex API error: ${response.status} ${response.statusText}`,
      ErrorCode.NETWORK_ERROR
    )
  }

  const data = await response.json()
  const prices = new Map()

  for (const ticker of data) {
    const symbol = ticker[0]
    const lastPrice = ticker[7]
    prices.set(symbol, lastPrice)
  }

  cache = { prices, timestamp: Date.now() }
  return prices
}

/**
 * Returns the current USD price of the native token for a network.
 *
 * @param {string} network - The network name.
 * @returns {Promise<number>} The USD price.
 */
export async function getNativeUsdPrice (network) {
  const config = getNetworkConfig(network)
  const bitfinexSymbol = NATIVE_SYMBOLS[config.nativeSymbol]
  if (!bitfinexSymbol) {
    throw new WdkCliError(
      `No USD price available for ${config.nativeSymbol} on ${network}.`,
      ErrorCode.TOKEN_NOT_SUPPORTED
    )
  }

  const prices = await fetchPrices()
  const price = prices.get(bitfinexSymbol)
  if (!price) {
    throw new WdkCliError(
      `Failed to fetch USD price for ${config.nativeSymbol}.`,
      ErrorCode.NETWORK_ERROR
    )
  }
  return price
}

/**
 * Returns the current USD price of an ERC-20 / SPL token.
 *
 * @param {string} network - The network name.
 * @param {string} tokenAddress - The token contract address.
 * @returns {Promise<number>} The USD price.
 */
export async function getTokenUsdPrice (network, tokenAddress) {
  const tokenConfig = getTokenConfig(network, tokenAddress)
  if (!tokenConfig) {
    throw new WdkCliError(`Unknown token ${tokenAddress} on ${network}.`, ErrorCode.INVALID_TOKEN)
  }

  const bitfinexSymbol = TOKEN_SYMBOLS[tokenConfig.symbol]
  if (!bitfinexSymbol) {
    throw new WdkCliError(
      `No USD price available for ${tokenConfig.symbol} on ${network}.`,
      ErrorCode.TOKEN_NOT_SUPPORTED
    )
  }

  const prices = await fetchPrices()
  const price = prices.get(bitfinexSymbol)
  if (!price) {
    throw new WdkCliError(
      `Failed to fetch USD price for ${tokenConfig.symbol}.`,
      ErrorCode.NETWORK_ERROR
    )
  }
  return price
}

/**
 * Converts a native or token amount (in base units) to a USD value.
 *
 * @param {string} network - The network name.
 * @param {bigint} amount - The amount in base units (e.g. wei, satoshis).
 * @param {string} [tokenAddress] - The token contract address; omit for native token.
 * @returns {Promise<number>} The equivalent USD value.
 */
export async function convertToUsd (network, amount, tokenAddress) {
  if (tokenAddress) {
    const tokenConfig = getTokenConfig(network, tokenAddress)
    if (!tokenConfig) {
      throw new WdkCliError(`Unknown token ${tokenAddress} on ${network}.`, ErrorCode.INVALID_TOKEN)
    }
    const price = await getTokenUsdPrice(network, tokenAddress)
    const value = new BigNumber(amount.toString()).shiftedBy(-tokenConfig.decimals)
    return value.multipliedBy(price).toNumber()
  }
  const config = getNetworkConfig(network)
  const price = await getNativeUsdPrice(network)
  const value = new BigNumber(amount.toString()).shiftedBy(-config.decimals)
  return value.multipliedBy(price).toNumber()
}
