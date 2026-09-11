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

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walletsFile } from '../config/wdk-config.js'
import { configService } from './config-service.js'
import { getOverrides, getOverride, isDisabled, setEnabled, clearOverride } from './override-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('../config/wdk-config.js').WdkModuleEntry} WdkModuleEntry */

const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * @typedef {Object} ModuleStatus
 * @property {string} module - The module package name.
 * @property {string} pinned - The version pinned in the catalog or user config.
 * @property {string | null} installed - The installed version, or null when not installed.
 * @property {'ok' | 'not installed' | 'version mismatch' | 'disabled' | 'stale override'} status - How the installed state compares to the pin.
 * @property {'built-in' | 'custom' | 'override'} source - Whether the module ships with the CLI, was added by the user, or only exists as an override.
 * @property {string} [defaultVersion] - The catalog version, present when a version override shadows it.
 */

/**
 * Returns whether a package name is a WDK wallet or protocol module
 * (`wdk-wallet-*` or `wdk-protocol-*`, any scope). These are the packages the
 * catalog manages as dependencies; core packages (`@tetherto/wdk`, `-utils`,
 * `-wallet`, `-asset-registry`) and unrelated deps do not match.
 *
 * @param {string} name - The npm package name (optionally scoped).
 * @returns {boolean} True when the name is a WDK module package.
 */
export function isWdkModulePackage (name) {
  const bare = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name
  return /^wdk-wallet-.+/.test(bare) || /^wdk-protocol-.+/.test(bare)
}

/**
 * Reads the installed version of a package from its package.json on disk.
 * Read directly (not via require): packages with an `exports` map do not
 * expose `./package.json` as an importable subpath.
 *
 * @param {string} name - The package name.
 * @returns {string | null} The installed version, or null when not installed.
 */
export function getInstalledVersion (name) {
  try {
    const raw = readFileSync(join(CLI_ROOT, 'node_modules', name, 'package.json'), 'utf8')
    return JSON.parse(raw).version || null
  } catch {
    return null
  }
}

/**
 * Returns the user-added modules from config.
 *
 * @returns {Record<string, WdkModuleEntry>} Custom module entries keyed by package name.
 */
export function getCustomModules () {
  const custom = configService.get('customModules')
  if (!custom || typeof custom !== 'object') return {}
  return /** @type {Record<string, WdkModuleEntry>} */ (custom)
}

/**
 * Returns all enabled modules, merging built-in catalog modules and user-added
 * ones. Built-in entries win on name collision, disabled entries are dropped,
 * and version overrides applied.
 *
 * @returns {Record<string, WdkModuleEntry>} Module entries keyed by package name.
 */
export function getAllModules () {
  /** @type {Record<string, WdkModuleEntry>} */
  const modules = {}
  for (const [name, entry] of Object.entries(getCustomModules())) {
    if (!isDisabled('modules', name)) modules[name] = entry
  }
  for (const [name, entry] of Object.entries(walletsFile.modules || {})) {
    if (isDisabled('modules', name)) continue
    const version = getOverride('modules', name)?.version
    modules[name] = version ? { ...entry, version } : entry
  }
  return modules
}

/**
 * Compares every module's pinned version against what is installed.
 *
 * @returns {ModuleStatus[]} One status entry per module, built-in first.
 */
export function getModuleStatuses () {
  const builtIn = walletsFile.modules || {}
  const custom = getCustomModules()
  const overrides = getOverrides().modules || {}
  /** @type {ModuleStatus[]} */
  const statuses = []
  for (const [name, e] of Object.entries(builtIn)) {
    const override = overrides[name]
    const pinned = override?.version ?? e.version
    const installed = getInstalledVersion(name)
    const status = override?.enabled === false
      ? 'disabled'
      : installed === null ? 'not installed' : installed === pinned ? 'ok' : 'version mismatch'
    statuses.push({
      module: name,
      pinned,
      installed,
      status,
      source: 'built-in',
      ...(override?.version ? { defaultVersion: e.version } : {})
    })
  }
  for (const [name, e] of Object.entries(custom)) {
    if (name in builtIn) continue
    const installed = getInstalledVersion(name)
    const status = overrides[name]?.enabled === false
      ? 'disabled'
      : installed === null ? 'not installed' : installed === e.version ? 'ok' : 'version mismatch'
    statuses.push({ module: name, pinned: e.version, installed, status, source: 'custom' })
  }
  for (const [name, o] of Object.entries(overrides)) {
    if (name in builtIn || name in custom) continue
    statuses.push({
      module: name,
      pinned: o.version ?? '-',
      installed: getInstalledVersion(name),
      status: 'stale override',
      source: 'override'
    })
  }
  return statuses
}

/**
 * @typedef {Object} AddTarget
 * @property {boolean} repair - True when the package is already registered and only needs reinstalling.
 * @property {string} [version] - The version to install: the requested one, or the registered pin when repairing.
 * @property {boolean} [builtinPin] - True when the add pins a built-in module to another version.
 * @property {string} [defaultVersion] - The catalog version, set when pinning a built-in.
 */

/**
 * Resolves what `module add` should do for a package: a fresh add, a version
 * pin overriding a built-in, or a reinstall of a registered module whose files
 * are missing or mismatched (e.g. pruned by a plain `npm install`).
 *
 * @param {string} name - The package name.
 * @param {string} [version] - The requested version, when given.
 * @returns {AddTarget} The add target.
 * @throws {WdkCliError} When the package is already at the requested version,
 *   a built-in without an explicit version, or registered at a different
 *   version than requested.
 */
export function resolveAddTarget (name, version) {
  const builtin = walletsFile.modules?.[name]
  if (builtin) {
    if (!version) {
      throw new WdkCliError(
        `'${name}' is a built-in module.`,
        ErrorCode.INVALID_ARGUMENT,
        `To replace its version, pass one explicitly: wdk module add --name ${name}@<version>`
      )
    }
    const current = getOverride('modules', name)?.version ?? builtin.version
    if (version === current) {
      throw new WdkCliError(`Module '${name}' is already at ${version}.`, ErrorCode.INVALID_ARGUMENT)
    }
    return { repair: false, builtinPin: true, version, defaultVersion: builtin.version }
  }
  const entry = getCustomModules()[name]
  if (!entry) return { repair: false, version }

  if (version && version !== entry.version) {
    throw new WdkCliError(
      `Module '${name}' is already added at ${entry.version}.`,
      ErrorCode.INVALID_ARGUMENT,
      `To change the version, remove it first: wdk module remove --name ${name}`
    )
  }
  if (getInstalledVersion(name) === entry.version) {
    throw new WdkCliError(
      `Module '${name}' is already added.`,
      ErrorCode.INVALID_ARGUMENT,
      `Remove it first with: wdk module remove --name ${name}`
    )
  }
  return { repair: true, version: entry.version }
}

/**
 * Persists a custom module entry in config.
 *
 * @param {string} name - The package name.
 * @param {string} version - The exact pinned version.
 * @returns {void}
 */
export function saveCustomModule (name, version) {
  configService.set('customModules', { ...getCustomModules(), [name]: { version } })
}

/**
 * Asserts that a package is a removable custom module.
 *
 * @param {string} name - The package name.
 * @returns {void}
 * @throws {WdkCliError} When the package is a built-in module or not added.
 */
export function assertRemovable (name) {
  if (walletsFile.modules?.[name]) {
    throw new WdkCliError(
      `'${name}' is a built-in module and cannot be removed.`,
      ErrorCode.INVALID_ARGUMENT,
      'Built-in modules ship with the CLI and are managed by its releases.'
    )
  }
  const custom = getCustomModules()
  if (!custom[name]) {
    const names = Object.keys(custom)
    throw new WdkCliError(
      `Module '${name}' is not a custom module.`,
      ErrorCode.INVALID_ARGUMENT,
      names.length > 0 ? `Custom modules: ${names.join(', ')}` : 'No custom modules are added.'
    )
  }
}

/**
 * Removes a custom module entry from config.
 *
 * @param {string} name - The package name.
 * @returns {void}
 * @throws {WdkCliError} When the package is a built-in module or not added.
 */
export function removeCustomModule (name) {
  assertRemovable(name)
  const custom = getCustomModules()
  const next = { ...custom }
  delete next[name]
  configService.set('customModules', next)
  clearOverride('modules', name)
}

/**
 * @typedef {Object} RemoveTarget
 * @property {boolean} builtinPin - True when the remove lifts a version pin on a built-in.
 * @property {string} [defaultVersion] - The catalog version to restore, set when lifting a pin.
 */

/**
 * Resolves what `module remove` should do for a package: remove a custom
 * module, or lift a version pin on a built-in and restore its catalog version.
 *
 * @param {string} name - The package name.
 * @returns {RemoveTarget} The remove target.
 * @throws {WdkCliError} When the package is an unpinned built-in or not added.
 */
export function resolveRemoveTarget (name) {
  const builtin = walletsFile.modules?.[name]
  if (builtin) {
    if (getOverride('modules', name)?.version) {
      return { builtinPin: true, defaultVersion: builtin.version }
    }
    throw new WdkCliError(
      `'${name}' is a built-in module and cannot be removed.`,
      ErrorCode.INVALID_ARGUMENT,
      'Built-in modules ship with the CLI and are managed by its releases.'
    )
  }
  assertRemovable(name)
  return { builtinPin: false }
}

/**
 * Enables or disables a module package, built-in or custom. Enabling a name
 * that only exists in overrides clears the stale entry instead.
 *
 * @param {string} name - The module package name.
 * @param {boolean} enabled - The desired state.
 * @returns {boolean} True when a stale override was cleared instead.
 * @throws {WdkCliError} When the package is unknown or already in the desired state.
 */
export function setModuleEnabled (name, enabled) {
  const verb = enabled ? 'enable' : 'disable'
  let suggestion = 'See package names with: wdk module list'
  if (walletsFile.networks[name]) {
    suggestion = `'${name}' is a network. Use: wdk network ${verb} --name ${name}`
  } else if (walletsFile.protocols?.[name]) {
    suggestion = `'${name}' is a protocol. ${enabled ? 'Enable' : 'Disable'} its module: wdk module ${verb} --name ${walletsFile.protocols[name].module}`
  }
  return setEnabled(
    'modules',
    name,
    enabled,
    Boolean(walletsFile.modules?.[name] || getCustomModules()[name]),
    new WdkCliError(`'${name}' is not a module.`, ErrorCode.INVALID_ARGUMENT, suggestion)
  )
}
