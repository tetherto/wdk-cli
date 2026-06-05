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
import { validateTokenEntry } from './token.js'

/**
 * @typedef {Object} ListNetworksInput
 * @property {boolean} [testnet] - When true, return only testnet networks.
 * @property {boolean} [mainnet] - When true, return only mainnet networks.
 */

/**
 * @typedef {Object} NetworkInfo
 * @property {string} name
 * @property {string} displayName
 * @property {string} module
 * @property {string} type
 * @property {string} [symbol] - Native token symbol (undefined when no native token is registered).
 * @property {number} [decimals] - Native token decimals (undefined when no native token is registered).
 * @property {boolean} testnet
 * @property {boolean} custom
 */

/**
 * @typedef {Object} ListNetworksResult
 * @property {NetworkInfo[]} networks
 * @property {number} count
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
 * @property {string} token - Registry key (e.g. "usdt")
 * @property {string} symbol
 * @property {number} decimals
 * @property {boolean} isNative
 * @property {string} [address]
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} NetworkSpec
 * @property {string} network - Network identifier (lowercase + hyphens)
 * @property {string} module - Wallet module name (must be in VALID_WALLET_TYPES)
 * @property {string} [displayName] - Defaults to network
 * @property {boolean} [testnet]
 * @property {string} [indexerSlug] - Defaults to network name
 * @property {Object} [config] - Pass-through SDK config (validated by the SDK)
 * @property {TokenSpecEntry[]} [tokens] - Optional token registry entries to register atomically (max one with isNative: true)
 */

/**
 * Validates a `wdk network create` spec object. Type-checks the known fields;
 * passes unknown top-level fields through silently so users can annotate their
 * specs (e.g. comments, ownership tags) without the CLI complaining.
 *
 * @param {unknown} data
 * @returns {NetworkSpec}
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

  const displayName = obj.displayName ?? network
  if (typeof displayName !== 'string' || !displayName) {
    throw new WdkCliError(
      'Network spec "displayName" must be a non-empty string when provided.',
      ErrorCode.INVALID_ARGUMENT
    )
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
    tokens = obj.tokens.map((item, idx) => {
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
      const { token: _tk, ...rest } = tokenItem
      const entry = validateTokenEntry(rest)
      return { token: tokenKey.toLowerCase(), ...entry }
    })
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
