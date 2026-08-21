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
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('../config/wdk-config.js').WdkModuleEntry} WdkModuleEntry */

const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * @typedef {Object} ModuleStatus
 * @property {string} module - The module package name.
 * @property {string} pinned - The version pinned in the catalog or user config.
 * @property {string | null} installed - The installed version, or null when not installed.
 * @property {'ok' | 'not installed' | 'version mismatch'} status - How the installed state compares to the pin.
 * @property {'built-in' | 'custom'} source - Whether the module ships with the CLI or was added by the user.
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
 * Returns all modules, merging built-in catalog modules and user-added ones.
 * Built-in entries win on name collision.
 *
 * @returns {Record<string, WdkModuleEntry>} Module entries keyed by package name.
 */
export function getAllModules () {
  return { ...getCustomModules(), ...(walletsFile.modules || {}) }
}

/**
 * Compares every module's pinned version against what is installed.
 *
 * @returns {ModuleStatus[]} One status entry per module, built-in first.
 */
export function getModuleStatuses () {
  const builtIn = walletsFile.modules || {}
  const custom = getCustomModules()
  const entries = [
    ...Object.entries(builtIn).map(([name, e]) => ({ name, pinned: e.version, source: /** @type {const} */ ('built-in') })),
    ...Object.entries(custom)
      .filter(([name]) => !(name in builtIn))
      .map(([name, e]) => ({ name, pinned: e.version, source: /** @type {const} */ ('custom') }))
  ]
  return entries.map(({ name, pinned, source }) => {
    const installed = getInstalledVersion(name)
    const status = installed === null
      ? 'not installed'
      : installed === pinned ? 'ok' : 'version mismatch'
    return { module: name, pinned, installed, status, source }
  })
}

/**
 * @typedef {Object} AddTarget
 * @property {boolean} repair - True when the package is already registered and only needs reinstalling.
 * @property {string} [version] - The version to install: the requested one, or the registered pin when repairing.
 */

/**
 * Resolves what `module add` should do for a package: a fresh add, or a
 * reinstall of a registered module whose files are missing or mismatched
 * (e.g. pruned by a plain `npm install`).
 *
 * @param {string} name - The package name.
 * @param {string} [version] - The requested version, when given.
 * @returns {AddTarget} The add target.
 * @throws {WdkCliError} When the package is a built-in module, already installed
 *   at its pin, or registered at a different version than requested.
 */
export function resolveAddTarget (name, version) {
  if (walletsFile.modules?.[name]) {
    throw new WdkCliError(
      `'${name}' is a built-in module.`,
      ErrorCode.INVALID_ARGUMENT,
      'Built-in modules ship with the CLI and are managed by its releases.'
    )
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
}
