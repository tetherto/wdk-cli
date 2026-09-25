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

import {
  PROTOCOL_KINDS,
  ADDABLE_KINDS,
  assertSingleInstanceKind,
  getProtocols,
  getAllProtocols,
  getProtocolsIncludingDisabled,
  findProtocol,
  isBuiltinProtocol,
  isCustomProtocol,
  getProviderNetworks,
  resolveProtocolConfig,
  loadProtocolClass,
  assertImplementsKind,
  saveCustomProvider,
  removeCustomProvider
} from '../services/protocol-service.js'
import { isRegisteredModule } from '../services/module-service.js'
import { clientClass } from '../services/pricing/index.js'
import { hasOwn } from '../services/override-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('../config/wdk-config.js').WdkProtocolEntry} WdkProtocolEntry */
/** @typedef {import('../config/wdk-config.js').ProtocolKind} ProtocolKind */
/** @typedef {import('../services/protocol-service.js').ProtocolClass} ProtocolClass */

/**
 * @typedef {Object} ProviderSpec
 * @property {string} name - The provider short name (lowercase alphanumeric with hyphens).
 * @property {ProtocolKind} kind - What the provider does; decides which requests quote it.
 * @property {string} module - The module package backing it; must already be registered.
 * @property {string[]} [endpointKeys] - Config keys the module takes as a callback rather than
 *   a value; the CLI stores a URL for each and POSTs to it when the module calls back.
 * @property {Record<string, unknown>} [config] - General config applied on every network.
 * @property {Record<string, Record<string, unknown>>} [networks] - Per-network config overrides.
 */

/**
 * @typedef {Object} ProviderInfo
 * @property {string} name - The provider short name.
 * @property {ProtocolKind} kind - The declared kind.
 * @property {string} [module] - The module package backing it; absent when the CLI
 *   calls the provider's API directly.
 * @property {'built-in' | 'custom'} source - Whether it ships with the CLI or was added by the user.
 * @property {boolean} enabled - False when the user disabled it or its module.
 */

/**
 * @typedef {Object} ListProvidersResult
 * @property {ProviderInfo[]} providers - The visible providers, packaged first.
 * @property {number} count - Number of entries returned (i.e. `providers.length`).
 */

/**
 * @typedef {Object} ProviderConfigView
 * @property {Record<string, unknown>} config - The network-independent config, packaged values and user overrides merged.
 * @property {Record<string, Record<string, unknown>>} networks - The merged config of each network that overrides something, keyed by network name.
 */

/** @typedef {ProviderInfo & ProviderConfigView} ProviderDetails */

/**
 * @typedef {Object} AddProviderResult
 * @property {string} name - The provider short name.
 * @property {ProtocolKind} kind - The declared kind.
 * @property {string} module - The module package backing it.
 * @property {true} added - Always `true` on a successful response.
 */

/**
 * @typedef {Object} DeleteProviderResult
 * @property {string} name - The provider short name.
 * @property {true} deleted - Always `true` on a successful response.
 */

/**
 * Returns a plain-object field of a spec, or undefined when absent.
 *
 * @param {Record<string, unknown>} obj - The spec object.
 * @param {string} field - The field name.
 * @returns {Record<string, unknown> | undefined} The field's value, or `undefined` when the field is absent.
 * @throws {WdkCliError} INVALID_ARGUMENT when the field is present but not a plain object.
 */
function objectField (obj, field) {
  const value = obj[field]
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WdkCliError(
      `Provider spec "${field}" must be an object when provided.`,
      ErrorCode.INVALID_ARGUMENT
    )
  }
  return /** @type {Record<string, unknown>} */ (value)
}

/**
 * Validates a `wdk provider add` spec. Unknown top-level fields pass through
 * silently, so users can annotate their specs.
 *
 * @param {unknown} data - The raw spec value (parsed JSON, untrusted input).
 * @returns {ProviderSpec} The validated spec.
 * @throws {WdkCliError} INVALID_ARGUMENT on any malformed field.
 * @throws {WdkCliError} INVALID_ARGUMENT when the name is a packaged provider.
 * @throws {WdkCliError} INVALID_ARGUMENT when a user-added provider of that name already exists.
 * @throws {WdkCliError} UNSUPPORTED_MODULE when `module` is not a registered module package.
 */
export function validateProviderSpec (data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new WdkCliError('Provider spec must be a JSON object.', ErrorCode.INVALID_ARGUMENT)
  }
  const obj = /** @type {Record<string, unknown>} */ (data)

  const name = obj.name
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new WdkCliError(
      'Provider spec "name" must be lowercase alphanumeric with hyphens.',
      ErrorCode.INVALID_ARGUMENT
    )
  }
  if (isBuiltinProtocol(name)) {
    throw new WdkCliError(
      `'${name}' is a built-in provider.`,
      ErrorCode.INVALID_ARGUMENT,
      'Register your module under a different name.'
    )
  }
  if (isCustomProtocol(name)) {
    throw new WdkCliError(
      `Provider '${name}' is already added.`,
      ErrorCode.INVALID_ARGUMENT,
      `Remove it first with: wdk provider delete --name ${name}`
    )
  }

  const kind = /** @type {ProtocolKind} */ (obj.kind)
  if (typeof kind !== 'string' || !PROTOCOL_KINDS.includes(kind)) {
    throw new WdkCliError(
      `Provider spec "kind" must be one of: ${PROTOCOL_KINDS.join(', ')}`,
      ErrorCode.INVALID_ARGUMENT
    )
  }
  if (!ADDABLE_KINDS.includes(kind)) {
    const label = kind[0].toUpperCase() + kind.slice(1)
    throw new WdkCliError(
      `${label} providers cannot be added.`,
      ErrorCode.INVALID_ARGUMENT,
      `${label} providers ship with the CLI. See the available ones with: wdk provider list`
    )
  }
  assertSingleInstanceKind(kind, name)

  const module = obj.module
  if (typeof module !== 'string' || !module) {
    throw new WdkCliError(
      'Provider spec "module" must be a package name.',
      ErrorCode.INVALID_ARGUMENT
    )
  }
  if (!isRegisteredModule(module)) {
    throw new WdkCliError(
      `Module '${module}' is not registered.`,
      ErrorCode.UNSUPPORTED_MODULE,
      `Add it first with: wdk module add --name ${module}`
    )
  }

  const endpointKeys = obj.endpointKeys
  if (endpointKeys !== undefined) {
    if (!Array.isArray(endpointKeys) || endpointKeys.some((k) => typeof k !== 'string' || !k)) {
      throw new WdkCliError(
        'Provider spec "endpointKeys" must be an array of non-empty strings.',
        ErrorCode.INVALID_ARGUMENT,
        'Name the config keys the module takes as a callback, e.g. {"endpointKeys":["widgetUrl"]}'
      )
    }
  }

  const config = objectField(obj, 'config')
  const networks = objectField(obj, 'networks')
  if (networks) {
    for (const [network, value] of Object.entries(networks)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new WdkCliError(
          `Provider spec "networks.${network}" must be an object.`,
          ErrorCode.INVALID_ARGUMENT
        )
      }
    }
  }

  /** @type {ProviderSpec} */
  const spec = { name, kind, module }
  if (endpointKeys) spec.endpointKeys = /** @type {string[]} */ (endpointKeys)
  if (config) spec.config = config
  if (networks) spec.networks = /** @type {Record<string, Record<string, unknown>>} */ (networks)
  return spec
}

/**
 * Loads the spec's module and checks it implements the declared kind.
 *
 * @param {ProviderSpec} spec - The validated spec.
 * @returns {Promise<void>}
 * @throws {WdkCliError} UNSUPPORTED_MODULE when the module is not a registered package.
 * @throws {WdkCliError} UNSUPPORTED_MODULE when the module is registered but not installed.
 * @throws {WdkCliError} INVALID_ARGUMENT when the module does not implement the declared kind.
 */
export async function verifyProviderKind (spec) {
  const loaded = await loadProtocolClass(spec.module)
  const ProtocolClass = spec.kind === 'pricing'
    ? /** @type {ProtocolClass} */ (clientClass(loaded, spec.name))
    : loaded
  assertImplementsKind(spec.name, spec.kind, ProtocolClass)
}

/**
 * Builds the listing entry for a provider.
 *
 * @param {string} name - The provider short name.
 * @param {WdkProtocolEntry} entry - The registry entry.
 * @param {Record<string, WdkProtocolEntry>} enabled - The usable providers.
 * @returns {ProviderInfo} The entry as `provider list` shows it.
 */
function toInfo (name, entry, enabled) {
  return {
    name,
    kind: entry.kind,
    module: entry.module,
    source: isBuiltinProtocol(name) ? 'built-in' : 'custom',
    enabled: hasOwn(enabled, name)
  }
}

/**
 * Lists the providers a user can act on, packaged first, then user-added:
 * the usable ones plus those the user disabled directly, which show
 * `enabled: false`. Providers hidden by a disabled module are left out, since
 * the module is what to re-enable and `wdk module list` shows it.
 *
 * @returns {ListProvidersResult} The visible providers.
 */
export function listProviders () {
  const enabled = getProtocols()
  const providers = Object.entries(getProtocolsIncludingDisabled())
    .map(([name, entry]) => toInfo(name, entry, enabled))
  return { providers, count: providers.length }
}

/**
 * Returns a provider's registry fields plus the effective config its module
 * receives, in general and on each network that overrides something. Packaged
 * values and the user's `wdk config set` overrides are already merged.
 *
 * @param {string} name - The provider short name.
 * @returns {ProviderDetails} The registry fields and the config the module receives.
 * @throws {WdkCliError} INVALID_ARGUMENT when no provider is registered under that name.
 */
export function getProviderInfo (name) {
  const entry = findProtocol(name)
  if (!entry) {
    const names = Object.keys(getAllProtocols())
    throw new WdkCliError(
      `Unknown provider '${name}'.`,
      ErrorCode.INVALID_ARGUMENT,
      names.length > 0 ? `Registered providers: ${names.join(', ')}` : 'No providers are registered.'
    )
  }
  const networks = Object.fromEntries(
    getProviderNetworks(name, entry).map((network) => [
      network,
      resolveProtocolConfig(name, network, { includeDisabled: true })
    ])
  )
  return {
    ...toInfo(name, entry, getProtocols()),
    config: resolveProtocolConfig(name, undefined, { includeDisabled: true }),
    networks
  }
}

/**
 * Registers a user-added provider. The caller is responsible for confirming
 * with the user and for verifying the module via {@link verifyProviderKind}.
 *
 * @param {ProviderSpec} spec - The validated spec, whose name is free.
 * @returns {AddProviderResult} The persisted entry.
 */
export function addProvider (spec) {
  /** @type {WdkProtocolEntry} */
  const entry = { kind: spec.kind, module: spec.module }
  if (spec.endpointKeys) entry.endpointKeys = spec.endpointKeys
  if (spec.config) entry.config = spec.config
  if (spec.networks) entry.networks = spec.networks
  saveCustomProvider(spec.name, entry)
  return { name: spec.name, kind: spec.kind, module: spec.module, added: true }
}

/**
 * Deletes a user-added provider.
 *
 * @param {string} name - The provider short name.
 * @returns {DeleteProviderResult} The deleted provider's name.
 * @throws {WdkCliError} INVALID_ARGUMENT when the name is a packaged provider.
 * @throws {WdkCliError} INVALID_ARGUMENT when no custom provider of that name was added.
 */
export function deleteProvider (name) {
  removeCustomProvider(name)
  return { name, deleted: true }
}
