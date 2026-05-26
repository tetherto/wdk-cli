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

import { getNetworkConfig } from '../config/networks.js'
import { getTokenConfig } from '../config/tokens.js'

/**
 * Formats a raw bigint amount into a human-readable string with symbol.
 *
 * @param {bigint} raw - Amount in base units.
 * @param {number} decimals - Number of decimal places for the asset.
 * @param {string} symbol - Asset symbol (e.g. ETH, USDT).
 * @returns {string} Formatted amount string, e.g. `1.5 ETH`.
 */
export function formatAmount(raw, decimals, symbol) {
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const remainder = raw % divisor
  if (remainder === 0n) return `${whole} ${symbol}`
  const decimal = remainder.toString().padStart(decimals, '0').replace(/0+$/, '')
  const trimmed = decimal.slice(0, 8)
  return `${whole}.${trimmed} ${symbol}`
}

/**
 * Formats a blockchain address, optionally truncating it.
 *
 * @param {string} address - The full address string.
 * @param {boolean} [truncate] - Whether to truncate long addresses. Defaults to false.
 * @returns {string} The formatted address.
 */
export function formatAddress(address, truncate = false) {
  if (!truncate || address.length <= 16) return address
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

/**
 * Formats a transaction hash, optionally truncating it.
 *
 * @param {string} hash - The full transaction hash.
 * @param {boolean} [truncate] - Whether to truncate long hashes. Defaults to true.
 * @returns {string} The formatted transaction hash.
 */
export function formatTxHash(hash, truncate = true) {
  if (!truncate || hash.length <= 16) return hash
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`
}

/**
 * Returns a display label for a network, e.g. `Ethereum (ETH)`.
 *
 * @param {string} network - Network name.
 * @returns {string} Human-readable network label.
 */
export function formatNetworkLabel(network) {
  const config = getNetworkConfig(network)
  return `${config.displayName} (${config.nativeSymbol})`
}

/**
 * Formats an ISO 8601 date string into a locale-appropriate date/time string.
 *
 * @param {string} dateStr - ISO 8601 date string.
 * @returns {string} Locale-formatted date string.
 */
export function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleString()
}

/**
 * Formats a token or native asset amount for display.
 *
 * @param {bigint} amount - Amount in base units.
 * @param {string} rawAmount - Raw string amount, used as fallback for unknown tokens.
 * @param {string} network - Network name.
 * @param {string} [token] - Token contract address. Omit for native asset.
 * @returns {{ formatted: string, symbol?: string }} Formatted amount and optional symbol.
 */
export function formatTokenAmount(amount, rawAmount, network, token) {
  if (token) {
    const tokenConfig = getTokenConfig(network, token)
    return tokenConfig
      ? { formatted: formatAmount(amount, tokenConfig.decimals, tokenConfig.symbol), symbol: tokenConfig.symbol }
      : { formatted: `${rawAmount} tokens (base units)` }
  }
  const config = getNetworkConfig(network)
  return { formatted: formatAmount(amount, config.decimals, config.nativeSymbol), symbol: config.nativeSymbol }
}
