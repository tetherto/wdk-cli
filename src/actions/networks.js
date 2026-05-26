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

/**
 * @typedef {Object} ListNetworksInput
 * @property {boolean} [testnet] - When true, return only testnet networks.
 * @property {boolean} [mainnet] - When true, return only mainnet networks.
 */

/**
 * @typedef {Object} NetworkInfo
 * @property {string} name - Network identifier (e.g. "ethereum").
 * @property {string} displayName - Human-readable network name.
 * @property {string} module - Wallet module name (e.g. "ethereum").
 * @property {string} type - Network type string.
 * @property {string} symbol - Native token symbol.
 * @property {number} decimals - Native token decimal places.
 * @property {boolean} testnet - Whether this is a testnet.
 * @property {boolean} custom - Whether this is a user-defined custom network.
 */

/**
 * @typedef {Object} ListNetworksResult
 * @property {NetworkInfo[]} networks - The matching network entries.
 * @property {number} count - Total number of networks returned.
 */

/**
 * Lists all supported blockchain networks, optionally filtered to mainnet or testnet.
 *
 * @param {ListNetworksInput} [input] - Optional filter parameters.
 * @returns {ListNetworksResult} The list of networks.
 */
export function listNetworks(input = {}) {
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
