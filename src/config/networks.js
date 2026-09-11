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
import { getCustomModules } from '../services/module-service.js'
import { getOverride, isDisabled, setEnabled, clearOverride } from '../services/override-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { walletsFile } from './wdk-config.js'
import { getNativeToken } from '../services/token-service.js'

/**
 * @typedef {Object} NetworkConfig
 * @property {string} name - The network identifier (e.g. "ethereum").
 * @property {string} displayName - The human-readable network name.
 * @property {string} type - The wallet module type (e.g. "wdk-wallet-evm").
 * @property {string} module - The wallet module package name.
 * @property {string} [nativeSymbol] - The native currency symbol from the token registry,
 *   if a native entry exists (e.g. "ETH"). May be undefined for networks without one.
 * @property {number} [decimals] - The number of decimals for the native currency, if known.
 * @property {boolean} [custom] - True when the network was added by the user.
 * @property {boolean} [testnet] - True when the network is a testnet.
 */

/**
 * Parses a module specifier into name and optional version.
 *
 * @param {string} moduleSpec - Module specifier, e.g. `@tetherto/wdk-wallet-btc@1.0.0-beta.8`.
 * @returns {{ name: string, version?: string }} Parsed module name and version.
 */
export function parseModuleName (moduleSpec) {
  const idx = moduleSpec.startsWith('@') ? moduleSpec.indexOf('@', 1) : moduleSpec.indexOf('@')
  if (idx > 0) {
    return { name: moduleSpec.slice(0, idx), version: moduleSpec.slice(idx + 1) }
  }
  return { name: moduleSpec }
}

const NETWORKS = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  const native = getNativeToken(name)
  NETWORKS[name] = {
    name,
    displayName: entry.displayName,
    type: parseModuleName(entry.module).name,
    module: entry.module,
    nativeSymbol: native?.symbol,
    decimals: native?.decimals,
    testnet: entry.testnet ?? false
  }
}

export { NETWORKS }

export const NETWORK_NAMES = Object.keys(NETWORKS)

/**
 * Returns the built-in networks with overrides applied: disabled entries
 * dropped, module replacements swapped in.
 *
 * @returns {Record<string, NetworkConfig>} Map of enabled built-in networks.
 */
function getEnabledBuiltinNetworks () {
  /** @type {Record<string, NetworkConfig>} */
  const result = {}
  for (const [name, network] of Object.entries(NETWORKS)) {
    const module = getOverride('networks', name)?.module ?? network.module
    if (isDisabled('networks', name) || isDisabled('modules', module)) continue
    result[name] = module === network.module
      ? network
      : { ...network, module, type: parseModuleName(module).name }
  }
  return result
}

/**
 * Returns the error for a network that failed to resolve.
 *
 * @param {string} name - Network name.
 * @returns {WdkCliError} The error to throw.
 */
function networkError (name) {
  if (isNetworkDisabled(name)) {
    const module = getOverride('networks', name)?.module ??
      (NETWORKS[name] ?? readCustomNetworks()[name]).module
    const suggestion = isDisabled('networks', name)
      ? `Enable it with: wdk network enable --name ${name}`
      : `Enable its module with: wdk module enable --name ${module}`
    return new WdkCliError(`Network '${name}' is disabled.`, ErrorCode.NETWORK_NOT_SUPPORTED, suggestion)
  }
  return new WdkCliError(`Network '${name}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
}

/**
 * Enables or disables a network, built-in or custom. Enabling a name that only
 * exists in overrides clears the stale entry instead.
 *
 * @param {string} name - The network name.
 * @param {boolean} enabled - The desired state.
 * @returns {boolean} True when a stale override was cleared instead.
 * @throws {WdkCliError} When the network is unknown or already in the desired state.
 */
export function setNetworkEnabled (name, enabled) {
  return setEnabled(
    'networks',
    name,
    enabled,
    name in NETWORKS || name in readCustomNetworks(),
    new WdkCliError(
      `'${name}' is not a network.`,
      ErrorCode.NETWORK_NOT_SUPPORTED,
      walletsFile.modules?.[name]
        ? `'${name}' is a module. Use: wdk module ${enabled ? 'enable' : 'disable'} --name ${name}`
        : 'See network names with: wdk network list'
    )
  )
}

/**
 * Returns the wallet module names a custom network may bind to: the modules
 * built-in networks use, plus any custom modules added via `wdk module add`.
 * Computed per call so freshly added modules count without a restart.
 *
 * @returns {string[]} The valid wallet module names.
 */
export function getValidWalletTypes () {
  return [
    ...new Set([
      ...Object.values(walletsFile.networks).map((w) => parseModuleName(w.module).name),
      ...Object.keys(getCustomModules())
    ])
  ]
}

/**
 * Returns every user-defined custom network from config, disabled ones included,
 * each marked with `custom: true`.
 *
 * @returns {Record<string, NetworkConfig>} Map of custom network name to config.
 */
function readCustomNetworks () {
  const custom = configService.get('customNetworks')
  if (!custom || typeof custom !== 'object') return {}
  /** @type {Record<string, NetworkConfig>} */
  const result = {}
  for (const [name, config] of Object.entries(custom)) {
    const native = getNativeToken(name)
    result[name] = {
      ...config,
      nativeSymbol: native?.symbol,
      decimals: native?.decimals,
      custom: true
    }
  }
  return result
}

/**
 * Returns the enabled custom networks: entries the user disabled, or whose
 * wallet module is disabled, are dropped.
 *
 * @returns {Record<string, NetworkConfig>} Map of custom network name to config.
 */
export function getCustomNetworks () {
  return Object.fromEntries(
    Object.entries(readCustomNetworks())
      .filter(([name, config]) => !isDisabled('networks', name) && !isDisabled('modules', config.module))
  )
}

/**
 * Returns all networks, merging built-in and custom networks.
 *
 * @returns {Record<string, NetworkConfig>} Combined map of all network configs.
 */
export function getAllNetworks () {
  return { ...getEnabledBuiltinNetworks(), ...getCustomNetworks() }
}

/**
 * Returns every network, disabled ones included, for listings that show state.
 *
 * @returns {Record<string, NetworkConfig>} Combined map of all network configs.
 */
export function getAllNetworksIncludingDisabled () {
  return { ...NETWORKS, ...readCustomNetworks() }
}

/**
 * Returns the names of all available networks.
 *
 * @returns {string[]} Array of all network names.
 */
export function getAllNetworkNames () {
  return Object.keys(getAllNetworks())
}

/**
 * Returns whether a network name is a built-in (non-custom) network.
 *
 * @param {string} name - Network name to check.
 * @returns {boolean} True if the network is built-in.
 */
export function isBuiltinNetwork (name) {
  return name in NETWORKS
}

/**
 * @typedef {Object} GetNetworkConfigOptions
 * @property {boolean} [includeDisabled] - Resolve entries the user disabled, for inspection (default: false).
 */

/**
 * Returns the config for a network by name, throwing if not found.
 *
 * @param {string} name - Network name.
 * @param {GetNetworkConfigOptions} [options] - Resolution options.
 * @returns {NetworkConfig} The network configuration.
 * @throws {WdkCliError} NETWORK_NOT_SUPPORTED when the network is unknown or disabled.
 */
export function getNetworkConfig (name, options = {}) {
  const all = options.includeDisabled ? getAllNetworksIncludingDisabled() : getAllNetworks()
  const config = all[name]
  if (!config) { throw networkError(name) }
  return config
}

/**
 * Returns whether a network exists but is currently hidden, directly or through
 * its wallet module.
 *
 * @param {string} name - Network name.
 * @returns {boolean} True when the network is disabled.
 */
export function isNetworkDisabled (name) {
  const known = name in NETWORKS || name in readCustomNetworks()
  return known && !(name in getAllNetworks())
}

/**
 * Returns whether a network name is valid (built-in or custom).
 *
 * @param {string} name - Network name to check.
 * @returns {boolean} True if the network exists.
 */
export function isValidNetwork (name) {
  return name in getEnabledBuiltinNetworks() || name in getCustomNetworks()
}

/**
 * Returns the CAIP-2 chain id for a network (e.g. "eip155:1", "tron:mainnet").
 * Custom networks without a configured chain id get a synthetic `wdk:<name>` id.
 *
 * @param {string} name - Network name.
 * @returns {string} The chain id.
 */
export function getChainId (name) {
  const customChainId = /** @type {string | undefined} */ (
    configService.get(`customNetworks.${name}.chainId`)
  )
  return walletsFile.networks[name]?.chainId ?? customChainId ?? `wdk:${name}`
}

/**
 * Returns whether a network is a testnet.
 *
 * @param {string} name - Network name to check.
 * @returns {boolean} True if the network is a testnet.
 */
export function isTestnet (name) {
  try {
    const config = getNetworkConfig(name)
    return config?.testnet === true
  } catch {
    return false
  }
}

/**
 * Returns whether a network is a user-defined custom network, disabled ones
 * included, so they stay manageable.
 *
 * @param {string} name - Network name to check.
 * @returns {boolean} True if the network is custom.
 */
export function isCustomNetwork (name) {
  return name in readCustomNetworks()
}

/**
 * Persists a custom network configuration to user config.
 *
 * @param {string} name - Network name.
 * @param {NetworkConfig} config - Network configuration to save.
 * @returns {void}
 */
export function saveCustomNetwork (name, config) {
  configService.set(`customNetworks.${name}`, config)
}

/**
 * Removes a custom network from user config.
 *
 * @param {string} name - Network name to delete.
 * @returns {void}
 */
export function deleteCustomNetwork (name) {
  configService.delete(`customNetworks.${name}`)
  clearOverride('networks', name)
}

/**
 * Throws if the given network name is not valid.
 *
 * @param {string} network - Network name to validate.
 * @returns {void}
 */
export function validateNetwork (network) {
  if (!isValidNetwork(network)) {
    throw networkError(network)
  }
}
