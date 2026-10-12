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
import { getOverrides, getOverride, isDisabled, setEnabled, clearOverride, hasOwn, getOwn } from '../services/override-service.js'
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

/** @type {Record<string, NetworkConfig>} */
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
 * Returns the built-in or custom network registered under an exact name.
 *
 * @param {string} name - Network name.
 * @returns {NetworkConfig | undefined} The network, or undefined when none is registered.
 */
function findNetwork (name) {
  return getOwn(NETWORKS, name) ?? getOwn(readCustomNetworks(), name)
}

/**
 * Returns the module a network resolves to, honouring a `module` override.
 *
 * @param {string} name - Network name.
 * @param {NetworkConfig} entry - The registered network.
 * @returns {string} The module package name.
 */
function moduleOf (name, entry) {
  return getOverride('networks', name)?.module ?? entry.module
}

/**
 * Returns the error for a network that failed to resolve. A network whose
 * module is disabled points at the module, whatever its own override says.
 *
 * @param {string} name - Network name.
 * @returns {WdkCliError} The error to throw.
 */
function networkError (name) {
  const entry = findNetwork(name)
  if (entry && !hasOwn(getAllNetworks(), name)) {
    const module = moduleOf(name, entry)
    const suggestion = isDisabled('modules', module)
      ? `Enable its module with: wdk module enable --name ${module}`
      : `Enable it with: wdk network enable --name ${name}`
    return new WdkCliError(`Network '${name}' is disabled.`, ErrorCode.NETWORK_NOT_SUPPORTED, suggestion)
  }
  return new WdkCliError(`Network '${name}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
}

/**
 * Enables or disables a network, built-in or custom. Enabling a name that only
 * exists in overrides clears the stale entry instead. A network whose module is
 * disabled cannot be toggled either way: the module is what to re-enable.
 *
 * @param {string} name - The network name.
 * @param {boolean} enabled - The desired state.
 * @returns {boolean} True when a stale override was cleared instead.
 * @throws {WdkCliError} When the network is unknown, hidden by a disabled module, or
 *   already in the desired state.
 */
export function setNetworkEnabled (name, enabled) {
  const entry = findNetwork(name)
  if (entry && isDisabled('modules', moduleOf(name, entry))) {
    throw new WdkCliError(
      `Network '${name}' is disabled by its module.`,
      ErrorCode.NETWORK_NOT_SUPPORTED,
      `Enable its module with: wdk module enable --name ${moduleOf(name, entry)}`
    )
  }
  return setEnabled(
    'networks',
    name,
    enabled,
    entry !== undefined,
    new WdkCliError(
      `'${name}' is not a network.`,
      ErrorCode.NETWORK_NOT_SUPPORTED,
      hasOwn(walletsFile.modules, name)
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
 * Returns the networks a listing shows: the usable ones plus those the user
 * disabled directly. Networks hidden by a disabled module are left out, even
 * when they carry their own override — the module is what you re-enable, and
 * `wdk module list` shows it.
 *
 * @returns {Record<string, NetworkConfig>} Combined map of visible network configs.
 */
export function getAllNetworksIncludingDisabled () {
  const all = { ...NETWORKS, ...readCustomNetworks() }
  const enabled = getAllNetworks()
  return Object.fromEntries(
    Object.entries(all).filter(([name, entry]) =>
      hasOwn(enabled, name) || (isDisabled('networks', name) && !isDisabled('modules', moduleOf(name, entry)))
    )
  )
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
  return hasOwn(NETWORKS, name)
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
  const config = getOwn(all, name)
  if (!config) { throw networkError(name) }
  return config
}

/**
 * Returns whether the user disabled a network directly. Networks hidden by a
 * disabled module are not reported here: they are the module's to re-enable.
 *
 * @param {string} name - Network name.
 * @returns {boolean} True when the network carries its own disabled override.
 */
export function isNetworkDisabled (name) {
  return findNetwork(name) !== undefined && isDisabled('networks', name)
}

/**
 * Returns whether a network name is valid (built-in or custom).
 *
 * @param {string} name - Network name to check.
 * @returns {boolean} True if the network exists.
 */
export function isValidNetwork (name) {
  return hasOwn(getAllNetworks(), name)
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
  return getOwn(walletsFile.networks, name)?.chainId ?? customChainId ?? `wdk:${name}`
}

/**
 * Returns whether a network is a testnet. Disabling is user state, so a
 * disabled network keeps its testnet flag.
 *
 * @param {string} name - Network name to check.
 * @returns {boolean} True if the network is a testnet.
 */
export function isTestnet (name) {
  try {
    return getNetworkConfig(name, { includeDisabled: true })?.testnet === true
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
  return hasOwn(readCustomNetworks(), name)
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
  for (const id of Object.keys(getOverrides().tokens || {})) {
    if (id.startsWith(`${name}/`)) clearOverride('tokens', id)
  }
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
