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

import { walletsFile } from '../config/wdk-config.js'
import { configService } from './config-service.js'
import { isRegisteredModule } from './module-service.js'
import { isDisabled, setEnabled, clearOverride, hasOwn, getOwn } from './override-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('../config/wdk-config.js').WdkProtocolEntry} WdkProtocolEntry */
/** @typedef {import('../config/wdk-config.js').ProtocolKind} ProtocolKind */

/**
 * A protocol module's default export, as seen before it is constructed: only
 * its prototype matters here, for checking which methods it implements.
 *
 * @typedef {Object} ProtocolClass
 * @property {Record<string, unknown>} [prototype] - The class prototype, carrying its methods.
 */

/** Every protocol kind the registry accepts, in the order listings show them. */
/**
 * Kinds the CLI resolves by kind, so only one of each may be enabled, mapped to
 * how an error names one.
 *
 * @type {Partial<Record<ProtocolKind, string>>}
 */
const SINGLE_INSTANCE_LABELS = { pricing: 'A price feed', indexer: 'An indexer' }

export const PROTOCOL_KINDS = /** @type {readonly ProtocolKind[]} */ (['swap', 'bridge', 'swidge', 'fiat', 'pricing', 'indexer'])

/** The kinds `wdk provider add` can register. */
export const ADDABLE_KINDS = /** @type {readonly ProtocolKind[]} */ (['swap', 'bridge', 'swidge', 'fiat', 'pricing'])

/**
 * The methods a protocol class must expose to serve each kind.
 *
 * @type {Record<ProtocolKind, readonly string[]>}
 */
const KIND_METHODS = {
  swap: ['quoteSwap', 'swap'],
  bridge: ['quoteBridge', 'bridge'],
  swidge: ['quoteSwidge', 'swidge'],
  fiat: ['quoteBuy', 'buy', 'quoteSell', 'sell'],
  pricing: ['getCurrentPrice', 'getMultiPriceData'],
  indexer: []
}

/**
 * Returns the user-added providers from config, keyed by short name.
 *
 * @returns {Record<string, WdkProtocolEntry>} Custom provider entries.
 */
export function getCustomProviders () {
  const custom = configService.get('customProviders')
  if (!custom || typeof custom !== 'object') return {}
  return /** @type {Record<string, WdkProtocolEntry>} */ (custom)
}

/**
 * Returns every registered protocol, packaged and user-added, without applying
 * any disable. Packaged entries win on name collision. Listings use this so a
 * protocol hidden by its disabled module stays visible as such.
 *
 * @returns {Record<string, WdkProtocolEntry>} Protocol entries keyed by short name.
 */
export function getAllProtocols () {
  /** @type {Record<string, WdkProtocolEntry>} */
  const result = { ...(walletsFile.providers || {}) }
  for (const [name, entry] of Object.entries(getCustomProviders())) {
    if (!hasOwn(result, name)) result[name] = entry
  }
  return result
}

/**
 * Returns all usable protocols, keyed by short name: the `providers` registry
 * in `wdk.config.json` merged with the user's `customProviders`. Packaged
 * entries come first, so they win both a name collision and a quote tie.
 * Protocols the user disabled, or whose module package is disabled, are dropped.
 *
 * @returns {Record<string, WdkProtocolEntry>} Protocol entries keyed by short name.
 */
export function getProtocols () {
  /** @type {Record<string, WdkProtocolEntry>} */
  const result = {}
  for (const [name, entry] of Object.entries(getAllProtocols())) {
    if (isDisabled('providers', name) || isDisabled('modules', entry.module)) continue
    result[name] = entry
  }
  return result
}

/**
 * Returns the protocols a listing shows: the usable ones plus those the user
 * disabled directly. Protocols hidden by a disabled module are left out, even
 * when they carry their own override — the module is what you re-enable, and
 * `wdk module list` shows it.
 *
 * @returns {Record<string, WdkProtocolEntry>} Protocol entries keyed by short name.
 */
export function getProtocolsIncludingDisabled () {
  const enabled = getProtocols()
  return Object.fromEntries(
    Object.entries(getAllProtocols()).filter(([name, entry]) =>
      hasOwn(enabled, name) || (isDisabled('providers', name) && !isDisabled('modules', entry.module))
    )
  )
}

/**
 * Returns the protocol registered under an exact name, packaged or custom,
 * whether or not its module is disabled.
 *
 * @param {string} name - The protocol short name.
 * @returns {WdkProtocolEntry | undefined} The entry, or undefined when none is registered.
 */
export function findProtocol (name) {
  return getOwn(getAllProtocols(), name)
}

/**
 * Returns whether a name is a packaged protocol that ships with the CLI.
 *
 * @param {string} name - The protocol short name.
 * @returns {boolean} True when the protocol is built in.
 */
export function isBuiltinProtocol (name) {
  return hasOwn(walletsFile.providers, name)
}

/**
 * Returns whether a name is a user-added protocol.
 *
 * @param {string} name - The protocol short name.
 * @returns {boolean} True when the protocol was added with `wdk provider add`.
 */
export function isCustomProtocol (name) {
  return hasOwn(getCustomProviders(), name)
}

/**
 * Returns the registered protocols whose declared kind can serve the given
 * request kind: `swap` and `swidge` entries serve a swap, `bridge` and `swidge`
 * a bridge. Decided from the registry alone, so no module is imported.
 *
 * @param {'swap' | 'bridge'} requestKind - Whether the caller needs a same-network swap or a cross-network bridge.
 * @returns {Record<string, WdkProtocolEntry>} Protocol entries keyed by short name.
 */
export function getProtocolsByKind (requestKind) {
  return Object.fromEntries(
    Object.entries(getProtocols()).filter(([, entry]) => servesRequest(entry.kind, requestKind))
  )
}

/**
 * Looks up a protocol entry by short name.
 *
 * @param {string} name - The protocol short name (e.g. "velora").
 * @returns {WdkProtocolEntry} The protocol entry.
 * @throws {WdkCliError} INVALID_ARGUMENT when no protocol is registered under that name.
 * @throws {WdkCliError} INVALID_ARGUMENT when the user disabled the protocol.
 * @throws {WdkCliError} INVALID_ARGUMENT when the protocol's module is disabled.
 */
export function getProtocol (name) {
  const protocol = getOwn(getProtocols(), name)
  if (!protocol) {
    const entry = findProtocol(name)
    if (entry) {
      throw new WdkCliError(
        `Protocol '${name}' is disabled.`,
        ErrorCode.INVALID_ARGUMENT,
        isDisabled('modules', entry.module)
          ? `Enable its module with: wdk module enable --name ${entry.module}`
          : `Enable it with: wdk provider enable --name ${name}`
      )
    }
    const names = Object.keys(getProtocols())
    throw new WdkCliError(
      `Unknown protocol '${name}'.`,
      ErrorCode.INVALID_ARGUMENT,
      names.length > 0 ? `Available protocols: ${names.join(', ')}` : 'No protocols are configured.'
    )
  }
  return protocol
}

/**
 * Returns a user-set config object stored under a dot-path key, or an empty
 * object when it is unset or not a plain object.
 *
 * @param {string} key - The config key (e.g. `providers.velora.config`).
 * @returns {Record<string, unknown>} The stored object.
 */
function userObject (key) {
  const value = configService.get(key)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return /** @type {Record<string, unknown>} */ (value)
}

/**
 * Returns the networks that override something for a protocol: the packaged
 * network entries naming it, the entry's own `networks`, and the networks the
 * user configured under `providers.<name>.networks`.
 *
 * @param {string} name - The protocol short name.
 * @param {WdkProtocolEntry} entry - The registry entry.
 * @returns {string[]} The network names, packaged first.
 */
export function getProviderNetworks (name, entry) {
  /** @type {Set<string>} */
  const names = new Set()
  for (const [network, networkEntry] of Object.entries(walletsFile.networks)) {
    if (hasOwn(networkEntry.providers, name)) names.add(network)
  }
  for (const network of Object.keys(entry.networks || {})) names.add(network)
  for (const network of Object.keys(userObject(`providers.${name}.networks`))) names.add(network)
  return [...names]
}

/**
 * @typedef {Object} ResolveConfigOptions
 * @property {boolean} [includeDisabled] - Resolve a disabled protocol's config, for inspection (default: false).
 */

/**
 * Resolves a protocol's effective config, shallow-merging four layers with the
 * later ones winning: the packaged general `config`, the user's
 * `providers.<name>.config`, the packaged per-network override in
 * `networks.<network>.providers.<name>` (or a user-added entry's own
 * `networks.<network>`, since it cannot edit the packaged network entries),
 * and the user's `providers.<name>.networks.<network>`. Without a network only
 * the two general layers apply.
 *
 * @param {string} name - The protocol short name.
 * @param {string} [network] - The network name; omit for the network-independent config.
 * @param {ResolveConfigOptions} [options] - Resolution options.
 * @returns {Record<string, unknown>} The merged config passed verbatim to the module.
 * @throws {WdkCliError} INVALID_ARGUMENT when no protocol is registered under that name.
 * @throws {WdkCliError} INVALID_ARGUMENT when the protocol is disabled and `includeDisabled` is not set.
 */
export function resolveProtocolConfig (name, network, options = {}) {
  const entry = options.includeDisabled ? findProtocol(name) : getProtocol(name)
  if (!entry) {
    throw new WdkCliError(
      `Unknown protocol '${name}'.`,
      ErrorCode.INVALID_ARGUMENT,
      'See provider names with: wdk provider list'
    )
  }
  const config = { ...(entry.config || {}), ...userObject(`providers.${name}.config`) }
  if (network === undefined) return config

  const packagedPerNetwork = getOwn(getOwn(walletsFile.networks, network)?.providers, name) ??
    getOwn(entry.networks, network) ?? {}
  return { ...config, ...packagedPerNetwork, ...userObject(`providers.${name}.networks.${network}`) }
}

/**
 * Checks that a loaded protocol class exposes the methods its declared kind
 * requires.
 *
 * @param {string} name - The protocol short name, for the error message.
 * @param {ProtocolKind} kind - The kind the registry declares for the provider.
 * @param {ProtocolClass} ProtocolClass - The class imported from the provider's module.
 * @returns {void}
 * @throws {WdkCliError} INVALID_ARGUMENT when the kind has no interface to check against.
 * @throws {WdkCliError} INVALID_ARGUMENT when the class is missing a method the kind requires.
 */
export function assertImplementsKind (name, kind, ProtocolClass) {
  const required = KIND_METHODS[kind]
  if (required.length === 0) {
    throw new WdkCliError(
      `Providers of kind '${kind}' cannot be verified against a module.`,
      ErrorCode.INVALID_ARGUMENT,
      `The CLI calls a ${kind} provider's API directly, so there is no interface to check.`
    )
  }
  const missing = required.filter(
    (method) => typeof ProtocolClass?.prototype?.[method] !== 'function'
  )
  if (missing.length === 0) return

  const served = ADDABLE_KINDS.filter((candidate) =>
    KIND_METHODS[candidate].every((method) => typeof ProtocolClass?.prototype?.[method] === 'function')
  )
  throw new WdkCliError(
    `Provider '${name}' is declared ${kind}, but its module does not implement ${missing.join(' and ')}.`,
    ErrorCode.INVALID_ARGUMENT,
    served.length > 0
      ? `Its module implements ${served.join(' and ')}. Register it with one of those kinds.`
      : `Its module implements none of: ${ADDABLE_KINDS.join(', ')}.`
  )
}

/**
 * Whether a protocol of the given kind can serve a request of the given kind.
 * A swidge protocol serves both swap and bridge requests.
 *
 * @param {ProtocolKind} protocolKind - The protocol's declared kind.
 * @param {'swap' | 'bridge'} requestKind - The request's kind.
 * @returns {boolean} True when the protocol can serve the request.
 */
export function servesRequest (protocolKind, requestKind) {
  return protocolKind === 'swidge' || protocolKind === requestKind
}

/**
 * Dynamically imports a protocol module and returns its default-exported class.
 * The specifier is checked against {@link isRegisteredModule} first.
 *
 * @param {string} module - The protocol module package name.
 * @returns {Promise<ProtocolClass>} The module's default-exported protocol class, before construction.
 * @throws {WdkCliError} UNSUPPORTED_MODULE when the package is not registered.
 * @throws {WdkCliError} UNSUPPORTED_MODULE when the package is registered but not installed.
 */
export async function loadProtocolClass (module) {
  if (!isRegisteredModule(module)) {
    throw new WdkCliError(
      `Module '${module}' is not registered.`,
      ErrorCode.UNSUPPORTED_MODULE,
      `Add it first with: wdk module add --name ${module}`
    )
  }
  try {
    const mod = await import(module)
    return mod.default || mod
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'MODULE_NOT_FOUND') {
      throw new WdkCliError(
        `Module '${module}' is not installed.`,
        ErrorCode.UNSUPPORTED_MODULE,
        `Install it with: wdk module add --name ${module}`
      )
    }
    throw err
  }
}

/**
 * Persists a user-added provider entry in config.
 *
 * @param {string} name - The protocol short name.
 * @param {WdkProtocolEntry} entry - The entry to store.
 * @returns {void}
 */
export function saveCustomProvider (name, entry) {
  configService.set('customProviders', { ...getCustomProviders(), [name]: entry })
}

/**
 * Removes a user-added provider entry from config.
 *
 * @param {string} name - The protocol short name.
 * @returns {void}
 * @throws {WdkCliError} INVALID_ARGUMENT when the name is a packaged provider.
 * @throws {WdkCliError} INVALID_ARGUMENT when no custom provider of that name was added.
 */
export function removeCustomProvider (name) {
  if (isBuiltinProtocol(name)) {
    throw new WdkCliError(
      `'${name}' is a built-in provider and cannot be deleted.`,
      ErrorCode.INVALID_ARGUMENT,
      'Built-in providers ship with the CLI and are managed by its releases.'
    )
  }
  const custom = getCustomProviders()
  if (!hasOwn(custom, name)) {
    const names = Object.keys(custom)
    throw new WdkCliError(
      `Provider '${name}' is not a custom provider.`,
      ErrorCode.INVALID_ARGUMENT,
      names.length > 0 ? `Custom providers: ${names.join(', ')}` : 'No custom providers are added.'
    )
  }
  const next = { ...custom }
  delete next[name]
  if (Object.keys(next).length === 0) configService.delete('customProviders')
  else configService.set('customProviders', next)
  clearOverride('providers', name)
}

/**
 * Returns whether the user disabled a protocol directly. Protocols hidden by a
 * disabled module are not reported here: the module is what to re-enable.
 *
 * @param {string} name - The protocol short name.
 * @returns {boolean} True when the protocol carries its own disabled override.
 */
export function isProviderDisabled (name) {
  return findProtocol(name) !== undefined && isDisabled('providers', name)
}

/**
 * Enables or disables a protocol, packaged or user-added. Enabling a name that
 * only exists in overrides clears the stale entry instead. A protocol whose
 * module is disabled cannot be toggled either way: the module is what to
 * re-enable.
 *
 * @param {string} name - The protocol short name.
 * @param {boolean} enabled - The desired state.
 * @returns {boolean} True when a stale override was cleared instead.
 * @throws {WdkCliError} INVALID_ARGUMENT when no protocol is registered under that name.
 * @throws {WdkCliError} INVALID_ARGUMENT when the protocol's module is disabled.
 * @throws {WdkCliError} INVALID_ARGUMENT when the protocol is already in the desired state.
 */
/**
 * Returns the one enabled provider of a kind the CLI resolves by kind rather
 * than by name, so a caller never has to guess which one served a result.
 *
 * @param {ProtocolKind} kind - The kind to resolve.
 * @param {string} label - What to call it in an error, singular (e.g. "price feed").
 * @param {(entry: WdkProtocolEntry) => boolean} [isUsable] - Extra condition an entry
 *   must meet, such as having its module installed (default: every enabled entry).
 * @returns {string} The provider short name.
 * @throws {WdkCliError} MISSING_CONFIG when none is enabled.
 * @throws {WdkCliError} INVALID_ARGUMENT when several are enabled at once.
 */
export function resolveSoleProvider (kind, label, isUsable = () => true) {
  const usable = namesOfKind(getProtocols(), kind, isUsable)
  if (usable.length === 0) {
    const known = namesOfKind(getAllProtocols(), kind)
    throw new WdkCliError(
      `No ${label} is available.`,
      ErrorCode.MISSING_CONFIG,
      known.length > 0
        ? `Enable one with: wdk provider enable --name ${known[0]}`
        : 'See the registered providers with: wdk provider list'
    )
  }
  if (usable.length > 1) {
    throw new WdkCliError(
      `Several ${label}s are enabled: ${usable.join(', ')}.`,
      ErrorCode.INVALID_ARGUMENT,
      'Only one runs at a time. Disable the others with: wdk provider disable --name <name>'
    )
  }
  return usable[0]
}

/**
 * Returns the names of the entries declaring a kind.
 *
 * @param {Record<string, WdkProtocolEntry>} entries - The entries to filter.
 * @param {ProtocolKind} kind - The kind to look for.
 * @param {(entry: WdkProtocolEntry) => boolean} [isUsable] - Extra condition an entry must meet.
 * @returns {string[]} The matching provider short names.
 */
function namesOfKind (entries, kind, isUsable = () => true) {
  return Object.entries(entries)
    .filter(([, e]) => e.kind === kind && isUsable(e))
    .map(([name]) => name)
}

/**
 * Returns the enabled providers of a kind, other than the one named.
 *
 * @param {ProtocolKind} kind - The kind to look for.
 * @param {string} name - The provider being added or enabled, which is excluded.
 * @returns {string[]} The other enabled providers of that kind.
 */
function otherEnabledOfKind (kind, name) {
  return Object.entries(getProtocols())
    .filter(([other, entry]) => other !== name && entry.kind === kind)
    .map(([other]) => other)
}

/**
 * Refuses a second provider of a kind the CLI resolves by kind, so it never has
 * to guess which one served a result.
 *
 * @param {ProtocolKind} kind - The kind being added or enabled.
 * @param {string} name - The provider being added or enabled.
 * @returns {void}
 * @throws {WdkCliError} INVALID_ARGUMENT when another provider of that kind is enabled.
 */
export function assertSingleInstanceKind (kind, name) {
  const label = SINGLE_INSTANCE_LABELS[kind]
  if (!label) return
  const [active] = otherEnabledOfKind(kind, name)
  if (!active) return
  throw new WdkCliError(
    `${label} is already enabled: ${active}.`,
    ErrorCode.INVALID_ARGUMENT,
    `Only one runs at a time. Disable it first with: wdk provider disable --name ${active}`
  )
}

export function setProviderEnabled (name, enabled) {
  const entry = findProtocol(name)
  if (enabled && entry) assertSingleInstanceKind(entry.kind, name)
  if (entry && isDisabled('modules', entry.module)) {
    throw new WdkCliError(
      `Provider '${name}' is disabled by its module.`,
      ErrorCode.INVALID_ARGUMENT,
      `Enable its module with: wdk module enable --name ${entry.module}`
    )
  }
  const verb = enabled ? 'enable' : 'disable'
  return setEnabled(
    'providers',
    name,
    enabled,
    entry !== undefined,
    new WdkCliError(
      `'${name}' is not a provider.`,
      ErrorCode.INVALID_ARGUMENT,
      isRegisteredModule(name)
        ? `'${name}' is a module. Use: wdk module ${verb} --name ${name}`
        : 'See provider names with: wdk provider list'
    )
  )
}
