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

import { getAllNetworks, getAllNetworkNames, isTestnet, VALID_WALLET_TYPES } from '../config/networks.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { validateTokenEntry, validateTokenName } from './token.js'

/**
 * @typedef {Object} ListNetworksInput
 * @property {boolean} [testnet] - When true, return only testnet networks.
 * @property {boolean} [mainnet] - When true, return only mainnet networks.
 */

/**
 * @typedef {Object} NetworkInfo
 * @property {string} name - Network identifier (e.g. "ethereum").
 * @property {string} displayName - Human-readable display name (e.g. "Ethereum").
 * @property {string} module - Versioned wallet module specifier (e.g. "@tetherto/wdk-wallet-evm@1.0.0").
 * @property {string} type - Wallet module name without version (e.g. "@tetherto/wdk-wallet-evm").
 * @property {string} [symbol] - Native token symbol (undefined when no native token is registered).
 * @property {number} [decimals] - Native token decimals (undefined when no native token is registered).
 * @property {boolean} testnet - True when the network is a testnet.
 * @property {boolean} custom - True when the network was added by the user via `wdk network create`.
 */

/**
 * @typedef {Object} ListNetworksResult
 * @property {NetworkInfo[]} networks - The matching network entries.
 * @property {number} count - Number of entries returned (i.e. `networks.length`).
 */

/**
 * Lists all supported blockchain networks, optionally filtered to mainnet or testnet.
 *
 * @param {ListNetworksInput} [input]
 * @returns {ListNetworksResult}
 */
export function listNetworks (input = {}) {
  const allNetworks = getAllNetworks()
  let names = getAllNetworkNames()

  if (input.testnet) names = names.filter((n) => isTestnet(n))
  else if (input.mainnet) names = names.filter((n) => !isTestnet(n))

  const networks = names.map((name) => {
    const config = allNetworks[name]
    return {
      name,
      displayName: config.displayName,
      module: config.module,
      type: config.type,
      symbol: config.nativeSymbol,
      decimals: config.decimals,
      testnet: isTestnet(name),
      custom: !!config.custom
    }
  })

  return { networks, count: networks.length }
}

/**
 * @typedef {Object} TokenSpecEntry
 * @property {string} token - Registry key for the token (lowercase alphanumeric; e.g. "usdt").
 * @property {string} symbol - Display symbol shown in the CLI (e.g. "USDT").
 * @property {number} decimals - Number of decimal places, integer 0–24.
 * @property {boolean} isNative - True for the network's native asset; false for ERC-20 / SPL / etc.
 * @property {string} [address] - Contract / mint address. Required for non-native tokens.
 * @property {{ indexerSlug?: string, moonpaySlug?: string, bitfinexSlug?: string }} [metadata] - Provider-specific identifiers.
 */

/**
 * @typedef {Object} NetworkSpec
 * @property {string} network - Network identifier (lowercase alphanumeric with hyphens).
 * @property {string} module - Wallet module name; must be one of `VALID_WALLET_TYPES`.
 * @property {string} displayName - Human-readable name; defaults to `network` if omitted in input.
 * @property {boolean} testnet - True when the network is a testnet; defaults to false.
 * @property {string} [indexerSlug] - Chain slug for the WDK indexer API; absence disables the indexer for this network.
 * @property {Object} [config] - Pass-through SDK config (provider URL, chainId, etc.); validated by the SDK at runtime.
 * @property {TokenSpecEntry[]} [tokens] - Token registry entries to register atomically with the network. At most one entry may have `isNative: true`.
 */

/**
 * Validates a single `tokens[i]` item from a network spec. Extracts the
 * registry key, delegates entry-shape validation to `validateTokenEntry`,
 * and returns the canonical `TokenSpecEntry`.
 *
 * @param {unknown} item - Raw token entry from the spec.
 * @param {number} idx - Position in the `tokens[]` array (for error messages).
 * @returns {TokenSpecEntry} The validated entry with `token` lowercased.
 * @throws {WdkCliError} INVALID_ARGUMENT on any malformed field.
 */
function validateTokenInSpec (item, idx) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new WdkCliError(
      `Network spec "tokens[${idx}]" must be an object.`,
      ErrorCode.INVALID_ARGUMENT
    )
  }
  const tokenItem = /** @type {Record<string, unknown>} */ (item)
  const tokenKey = tokenItem.token
  if (typeof tokenKey !== 'string' || !tokenKey) {
    throw new WdkCliError(
      `Network spec "tokens[${idx}].token" must be a non-empty string (registry key).`,
      ErrorCode.INVALID_ARGUMENT
    )
  }
  validateTokenName(tokenKey)
  const { token: _tk, ...rest } = tokenItem
  const entry = validateTokenEntry(rest)
  return { token: tokenKey, ...entry }
}

/**
 * Validates a `wdk network create` spec object. Type-checks the known fields;
 * passes unknown top-level fields through silently so users can annotate their
 * specs (e.g. comments, ownership tags) without the CLI complaining.
 *
 * @param {unknown} data - The raw spec value (parsed JSON, untrusted input).
 * @returns {NetworkSpec} The validated and normalized spec.
 * @throws {WdkCliError} INVALID_ARGUMENT on any malformed field.
 * @throws {WdkCliError} UNSUPPORTED_MODULE when `module` isn't a known wallet module.
 */
export function validateNetworkSpec (data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new WdkCliError('Network spec must be a JSON object.', ErrorCode.INVALID_ARGUMENT)
  }
  const obj = /** @type {Record<string, unknown>} */ (data)

  const network = obj.network
  if (typeof network !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(network)) {
    throw new WdkCliError(
      'Network spec "network" must be lowercase alphanumeric with hyphens.',
      ErrorCode.INVALID_ARGUMENT
    )
  }

  const moduleName = obj.module
  if (typeof moduleName !== 'string' || !VALID_WALLET_TYPES.includes(moduleName)) {
    throw new WdkCliError(
      `Network spec "module" must be one of: ${VALID_WALLET_TYPES.join(', ')}`,
      ErrorCode.UNSUPPORTED_MODULE
    )
  }

  let displayName = network
  if (obj.displayName !== undefined) {
    if (typeof obj.displayName !== 'string' || !obj.displayName) {
      throw new WdkCliError(
        'Network spec "displayName" must be a non-empty string when provided.',
        ErrorCode.INVALID_ARGUMENT
      )
    }
    displayName = obj.displayName
  }

  const testnet = obj.testnet ?? false
  if (typeof testnet !== 'boolean') {
    throw new WdkCliError('Network spec "testnet" must be a boolean.', ErrorCode.INVALID_ARGUMENT)
  }

  let indexerSlug
  if (obj.indexerSlug !== undefined) {
    if (typeof obj.indexerSlug !== 'string' || !obj.indexerSlug) {
      throw new WdkCliError(
        'Network spec "indexerSlug" must be a non-empty string when provided.',
        ErrorCode.INVALID_ARGUMENT
      )
    }
    indexerSlug = obj.indexerSlug
  }

  let config
  if (obj.config !== undefined) {
    if (!obj.config || typeof obj.config !== 'object' || Array.isArray(obj.config)) {
      throw new WdkCliError(
        'Network spec "config" must be an object when provided.',
        ErrorCode.INVALID_ARGUMENT
      )
    }
    config = /** @type {Record<string, unknown>} */ (obj.config)
  }

  /** @type {TokenSpecEntry[] | undefined} */
  let tokens
  if (obj.tokens !== undefined) {
    if (!Array.isArray(obj.tokens)) {
      throw new WdkCliError(
        'Network spec "tokens" must be an array when provided.',
        ErrorCode.INVALID_ARGUMENT
      )
    }
    tokens = obj.tokens.map(validateTokenInSpec)
    const seen = new Set()
    const duplicates = []
    for (const t of tokens) {
      if (seen.has(t.token)) duplicates.push(t.token)
      seen.add(t.token)
    }
    if (duplicates.length > 0) {
      throw new WdkCliError(
        `Network spec "tokens" has duplicate registry key(s): ${[...new Set(duplicates)].join(', ')}.`,
        ErrorCode.INVALID_ARGUMENT
      )
    }
    const natives = tokens.filter((t) => t.isNative)
    if (natives.length > 1) {
      throw new WdkCliError(
        `Network spec "tokens" has ${natives.length} native entries (${natives.map((t) => t.token).join(', ')}). Each network can have at most one native token.`,
        ErrorCode.INVALID_ARGUMENT
      )
    }
  }

  /** @type {NetworkSpec} */
  const spec = { network, module: moduleName, displayName, testnet }
  if (indexerSlug) spec.indexerSlug = indexerSlug
  if (config) spec.config = config
  if (tokens) spec.tokens = tokens
  return spec
}
