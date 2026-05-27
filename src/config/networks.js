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

import { configService } from '../services/config-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import walletsFileRaw from '../../wdk.config.json' with { type: 'json' }

/**
 * @typedef {Object} NetworkConfig
 * @property {string} name - The network identifier (e.g. "ethereum").
 * @property {string} displayName - The human-readable network name.
 * @property {string} type - The wallet module type (e.g. "wdk-wallet-evm").
 * @property {string} module - The wallet module package name.
 * @property {string} nativeSymbol - The native currency symbol (e.g. "ETH").
 * @property {number} decimals - The number of decimals for the native currency.
 * @property {boolean} [custom] - True when the network was added by the user.
 * @property {boolean} [testnet] - True when the network is a testnet.
 */

/**
 * @typedef {Object} IndexerEntry
 * @property {string} blockchain - The indexer blockchain identifier.
 * @property {string[]} tokens - The token symbols supported by the indexer for this network.
 */

/**
 * @typedef {Object} WdkNetworkEntry
 * @property {string} module - The wallet module package name.
 * @property {string} displayName - The human-readable network name.
 * @property {string} nativeSymbol - The native currency symbol.
 * @property {number} decimals - The number of decimals for the native currency.
 * @property {boolean} [testnet] - True when the network is a testnet.
 * @property {IndexerEntry} [indexer] - The indexer configuration for this network.
 * @property {{ moonpay?: Record<string, string> }} [ramp] - The ramp provider configuration keyed by provider name.
 * @property {Record<string, unknown>} [config] - The per-network module configuration.
 */

/**
 * @typedef {Object} WdkConfigFile
 * @property {number} version - The config file format version.
 * @property {Record<string, unknown>} defaults - The default global configuration.
 * @property {Record<string, WdkNetworkEntry>} networks - The network definitions keyed by network name.
 */

/** @type {WdkConfigFile} */
const walletsFile = walletsFileRaw

/**
 * Parses a module specifier into name and optional version.
 *
 * @param {string} moduleSpec - Module specifier, e.g. `@scope/pkg@1.0.0`.
 * @returns {{ name: string, version?: string }} Parsed module name and version.
 */
export function parseModuleName(moduleSpec) {
  const idx = moduleSpec.startsWith('@') ? moduleSpec.indexOf('@', 1) : moduleSpec.indexOf('@')
  if (idx > 0) {
    return { name: moduleSpec.slice(0, idx), version: moduleSpec.slice(idx + 1) }
  }
  return { name: moduleSpec }
}

const NETWORKS = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  NETWORKS[name] = {
    name,
    displayName: entry.displayName,
    type: parseModuleName(entry.module).name,
    module: entry.module,
    nativeSymbol: entry.nativeSymbol,
    decimals: entry.decimals,
    testnet: entry.testnet ?? false
  }
}

export { NETWORKS }

export const NETWORK_NAMES = Object.keys(NETWORKS)

/**
 * Returns all user-defined custom networks from config, each marked with `custom: true`.
 *
 * @returns {Record<string, NetworkConfig>} Map of custom network name to config.
 */
export function getCustomNetworks() {
  const custom = configService.get('customNetworks')
  if (!custom || typeof custom !== 'object') return {}
  /** @type {Record<string, NetworkConfig>} */
  const result = {}
  for (const [name, config] of Object.entries(custom)) {
    result[name] = { ...(/** @type {NetworkConfig} */ (config)), custom: true }
  }
  return result
}

/**
 * Returns all networks, merging built-in and custom networks.
 *
 * @returns {Record<string, NetworkConfig>} Combined map of all network configs.
 */
export function getAllNetworks() {
  return { ...NETWORKS, ...getCustomNetworks() }
}

/**
 * Returns the names of all available networks.
 *
 * @returns {string[]} Array of all network names.
 */
export function getAllNetworkNames() {
  return Object.keys(getAllNetworks())
}

/**
 * Returns whether a network name is a built-in (non-custom) network.
 *
 * @param {string} name - Network name to check.
 * @returns {boolean} True if the network is built-in.
 */
export function isBuiltinNetwork(name) {
  return name in NETWORKS
}

/**
 * Returns the config for a network by name, throwing if not found.
 *
 * @param {string} name - Network name.
 * @returns {NetworkConfig} The network configuration.
 */
export function getNetworkConfig(name) {
  const all = getAllNetworks()
  const config = all[name]
  if (!config) throw new WdkCliError(`Network '${name}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  return config
}

/**
 * Returns whether a network name is valid (built-in or custom).
 *
 * @param {string} name - Network name to check.
 * @returns {boolean} True if the network exists.
 */
export function isValidNetwork(name) {
  return name in NETWORKS || name in getCustomNetworks()
}

/**
 * Returns whether a network is a testnet.
 *
 * @param {string} name - Network name to check.
 * @returns {boolean} True if the network is a testnet.
 */
export function isTestnet(name) {
  try {
    const config = getNetworkConfig(name)
    return config?.testnet === true
  } catch {
    return false
  }
}

/**
 * Returns whether a network is a user-defined custom network.
 *
 * @param {string} name - Network name to check.
 * @returns {boolean} True if the network is custom.
 */
export function isCustomNetwork(name) {
  return name in getCustomNetworks()
}

/**
 * Persists a custom network configuration to user config.
 *
 * @param {string} name - Network name.
 * @param {NetworkConfig} config - Network configuration to save.
 * @returns {void}
 */
export function saveCustomNetwork(name, config) {
  configService.set(`customNetworks.${name}`, config)
}

/**
 * Removes a custom network from user config.
 *
 * @param {string} name - Network name to delete.
 * @returns {void}
 */
export function deleteCustomNetwork(name) {
  configService.delete(`customNetworks.${name}`)
}

/**
 * Throws if the given network name is not valid.
 *
 * @param {string} network - Network name to validate.
 * @returns {void}
 */
export function validateNetwork(network) {
  if (!isValidNetwork(network)) {
    throw new WdkCliError(`Network '${network}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  }
}
