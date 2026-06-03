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

import { tokensFile } from '../config/wdk-tokens.js'
import { configService } from './config-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { humanToBaseUnits } from '../ui/parsers.js'

/** @typedef {import('../config/wdk-tokens.js').TokenEntry} TokenEntry */
/** @typedef {import('../config/wdk-tokens.js').TokenMetadata} TokenMetadata */

/**
 * Normalizes an EVM address to lowercase for case-insensitive comparison.
 * Leaves non-EVM addresses (e.g. base58 Solana, Tron) untouched.
 *
 * @param {string} address
 * @returns {string}
 */
function normalizeAddress (address) {
  return address.startsWith('0x') ? address.toLowerCase() : address
}

/**
 * Builds the effective token map for a network: built-in entries merged with
 * any user-defined entries under `customTokens.<network>.*`. Custom entries
 * override built-in ones when keys collide.
 *
 * @param {string} network
 * @returns {Record<string, TokenEntry>}
 */
function getMergedTokens (network) {
  const builtin = tokensFile.tokens[network] ?? {}
  const custom = /** @type {Record<string, TokenEntry> | undefined} */ (
    configService.get(`customTokens.${network}`)
  )
  return { ...builtin, ...(custom ?? {}) }
}

/**
 * Resolves a token by its registry token (case-insensitive).
 *
 * @param {string} network - The network name.
 * @param {string} token - The token (e.g. "usdt").
 * @returns {TokenEntry | undefined} The token entry, or undefined if not registered.
 */
export function getTokenByName (network, token) {
  return getMergedTokens(network)[token.toLowerCase()]
}

/**
 * Resolves a token by contract address on a given network. EVM addresses are
 * matched case-insensitively; non-EVM addresses are matched exactly.
 *
 * @param {string} network - The network name.
 * @param {string} address - The contract / mint address.
 * @returns {TokenEntry | undefined} The token entry, or undefined if no match.
 */
export function getTokenByAddress (network, address) {
  const target = normalizeAddress(address)
  for (const token of Object.values(getMergedTokens(network))) {
    if (!token.address) continue
    if (normalizeAddress(token.address) === target) return token
  }
  return undefined
}

/**
 * Returns all tokens (built-in + custom merged) for the given network.
 *
 * @param {string} network - The network name.
 * @returns {Record<string, TokenEntry>} Token entries keyed by token.
 */
export function getTokensForNetwork (network) {
  return getMergedTokens(network)
}

/**
 * Returns the indexer code (`metadata.indexer`) for the given token, or undefined
 * when the token isn't registered or has no indexer mapping.
 *
 * @param {string} network
 * @param {string} token
 * @returns {string | undefined}
 */
export function getIndexerCode (network, token) {
  return getTokenByName(network, token)?.metadata?.indexer
}

/**
 * Returns the MoonPay asset code (`metadata.moonpay`) for the given token, or
 * undefined when the token isn't registered or has no MoonPay mapping.
 *
 * @param {string} network
 * @param {string} token
 * @returns {string | undefined}
 */
export function getMoonpayCode (network, token) {
  return getTokenByName(network, token)?.metadata?.moonpay
}

/**
 * Returns the Bitfinex trading pair (`metadata.bitfinex`) for the given token,
 * or undefined when the token isn't registered or has no Bitfinex mapping.
 *
 * @param {string} network
 * @param {string} token
 * @returns {string | undefined}
 */
export function getBitfinexCode (network, token) {
  return getTokenByName(network, token)?.metadata?.bitfinex
}

/**
 * Returns the list of token names on a network that have a mapping for the
 * given provider in their `metadata` block.
 *
 * @param {string} network
 * @param {'indexer' | 'moonpay' | 'bitfinex'} provider
 * @returns {string[]} Token names (lowercase keys from the registry).
 */
export function getTokensSupportedBy (network, provider) {
  /** @type {string[]} */
  const result = []
  for (const [token, entry] of Object.entries(getMergedTokens(network))) {
    if (entry.metadata && typeof entry.metadata[provider] === 'string') result.push(token)
  }
  return result
}

/**
 * Returns the native token entry for the given network, or undefined if none
 * is marked `isNative: true`.
 *
 * @param {string} network - The network name.
 * @returns {TokenEntry | undefined}
 */
export function getNativeToken (network) {
  for (const token of Object.values(getMergedTokens(network))) {
    if (token.isNative) return token
  }
  return undefined
}

/**
 * Returns the full token registry (all networks, built-in + custom merged).
 *
 * @returns {Record<string, Record<string, TokenEntry>>}
 */
export function getAllTokens () {
  /** @type {Record<string, Record<string, TokenEntry>>} */
  const result = {}
  for (const network of Object.keys(tokensFile.tokens)) {
    result[network] = getMergedTokens(network)
  }
  const customAll = /** @type {Record<string, Record<string, TokenEntry>> | undefined} */ (
    configService.get('customTokens')
  )
  if (customAll) {
    for (const network of Object.keys(customAll)) {
      if (!result[network]) result[network] = customAll[network]
    }
  }
  return result
}

/**
 * Returns true when the token is defined as a built-in entry for the network.
 *
 * @param {string} network
 * @param {string} token
 * @returns {boolean}
 */
export function isBuiltinToken (network, token) {
  return !!tokensFile.tokens[network]?.[token.toLowerCase()]
}

/**
 * Returns the effective source of a token entry: `'custom'` when overridden or
 * added via `wdk token add`, `'built-in'` when only defined in `wdk.tokens.json`,
 * or `undefined` when not registered.
 *
 * @param {string} network
 * @param {string} token
 * @returns {'built-in' | 'custom' | undefined}
 */
export function getTokenSource (network, token) {
  const lower = token.toLowerCase()
  const custom = configService.get(`customTokens.${network}.${lower}`)
  if (custom !== undefined) return 'custom'
  if (tokensFile.tokens[network]?.[lower]) return 'built-in'
  return undefined
}

/**
 * @typedef {Object} ResolvedTokenIdentifier
 * @property {boolean} isNative - True when the token is the chain's native asset.
 *   Callers should route to the native send/balance path and ignore `address`.
 * @property {string} [address] - Contract address for non-native tokens.
 *   Always present for non-native; may also be present for native (wrapped representation).
 */

/**
 * Resolves a user-provided `--token` value against the registry, returning both
 * the contract address and whether the token is the chain's native asset.
 * The token must be registered — no raw-address fallback. Native tokens are
 * accepted: callers branch on `isNative` to choose the right downstream path.
 *
 * @param {string} network
 * @param {string} token - The user-supplied token name (e.g. "usdt", "eth").
 * @returns {ResolvedTokenIdentifier}
 * @throws {WdkCliError} When the token is not registered, or when a non-native
 *   token entry has no contract address (e.g. indexer-only entry).
 */
export function resolveTokenIdentifier (network, token) {
  const hit = getTokenByName(network, token)
  if (!hit) {
    throw new WdkCliError(
      `Token '${token}' is not registered on '${network}'.`,
      ErrorCode.TOKEN_NOT_SUPPORTED,
      `Run \`wdk token list --network ${network}\` to see the available tokens.`
    )
  }
  if (!hit.isNative && !hit.address) {
    throw new WdkCliError(
      `Token '${token}' on '${network}' has no contract address registered.`,
      ErrorCode.TOKEN_NOT_SUPPORTED
    )
  }
  return { isNative: hit.isNative, address: hit.address }
}

/**
 * Writes a custom token entry under `customTokens.<network>.<token>`.
 * The caller is responsible for validating `entry` before calling.
 *
 * @param {string} network
 * @param {string} token
 * @param {TokenEntry} entry
 * @returns {void}
 */
export function saveCustomToken (network, token, entry) {
  configService.set(`customTokens.${network}.${token.toLowerCase()}`, entry)
}

/**
 * Deletes a custom token entry. Returns false when no custom entry exists.
 *
 * @param {string} network
 * @param {string} token
 * @returns {boolean} True if a custom entry was deleted; false otherwise.
 */
export function deleteCustomToken (network, token) {
  const key = `customTokens.${network}.${token.toLowerCase()}`
  if (configService.get(key) === undefined) return false
  configService.delete(key)
  return true
}

/**
 * Converts a human-readable decimal amount to base units, using the registered
 * decimals of the given token (or the native token when `token` is omitted).
 *
 * @param {string} network
 * @param {string | undefined} token - Token name; omit for native.
 * @param {string} decimalAmount - Decimal string (e.g. "1.5").
 * @returns {string} The base-unit amount as a string (suitable for BigInt).
 * @throws {WdkCliError} When the token has no registered decimals, when the
 *   decimal value is malformed, or when it has more precision than the token allows.
 */
export function toBaseUnits (network, token, decimalAmount) {
  let decimals
  let label
  if (token) {
    const entry = getTokenByName(network, token)
    decimals = entry?.decimals
    label = token
  } else {
    const native = getNativeToken(network)
    decimals = native?.decimals
    label = native?.symbol ?? 'native'
  }
  if (typeof decimals !== 'number') {
    throw new WdkCliError(
      `Cannot determine decimals for '${label}' on '${network}'.`,
      ErrorCode.TOKEN_NOT_SUPPORTED
    )
  }
  return humanToBaseUnits(decimalAmount, decimals, label)
}
