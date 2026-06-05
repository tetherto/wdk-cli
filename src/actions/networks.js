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

import { getAllNetworks, getAllNetworkNames, isTestnet } from '../config/networks.js'
import { NetworkSpecSchema, parseSpec } from '../ui/schemas.js'

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
 * @property {string} token - Registry key for the token (lowercased; e.g. "usdt").
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
 * Validates a `wdk network create` spec via the zod schema. Type-checks the
 * known fields; passes unknown top-level fields through silently so users can
 * annotate their specs (e.g. comments, ownership tags) without the CLI
 * complaining. Enforces no duplicate token keys and at most one native token.
 *
 * @param {unknown} data - The raw spec value (parsed JSON, untrusted input).
 * @returns {NetworkSpec} The validated and normalized spec.
 * @throws {WdkCliError} INVALID_ARGUMENT on any malformed field.
 * @throws {WdkCliError} UNSUPPORTED_MODULE when `module` isn't a known wallet module.
 */
export function validateNetworkSpec (data) {
  return /** @type {NetworkSpec} */ (parseSpec(NetworkSpecSchema, data, 'Network spec'))
}
