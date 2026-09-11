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

import { configService } from './config-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {'modules' | 'networks' | 'tokens'} OverrideKind */

/**
 * @typedef {Object} OverrideEntry
 * @property {boolean} [enabled] - False when the built-in entry is disabled.
 * @property {string} [version] - Version replacing a module's built-in pin.
 * @property {string} [module] - Package replacing a network's wallet module.
 */

/**
 * @typedef {Partial<Record<OverrideKind, Record<string, OverrideEntry>>>} Overrides
 * Override entries grouped by registry kind, then keyed by entry name.
 */

/** User-config key the override deltas are stored under. */
const OVERRIDES_KEY = 'overrides'

/**
 * Returns the user's overrides of built-in registry entries, stored as deltas:
 * an absent entry means the packaged default applies unchanged.
 *
 * @returns {Overrides} The stored overrides, empty when nothing is overridden.
 */
export function getOverrides () {
  const overrides = configService.get(OVERRIDES_KEY)
  if (!overrides || typeof overrides !== 'object') return {}
  return /** @type {Overrides} */ (overrides)
}

/**
 * Returns the override entry for a built-in registry entry, if any.
 *
 * @param {OverrideKind} kind - The registry kind.
 * @param {string} name - The entry name (network name, package name, or token id).
 * @returns {OverrideEntry | undefined} The override entry.
 */
export function getOverride (kind, name) {
  return getOverrides()[kind]?.[name]
}

/**
 * Merges a patch into an override entry, pruning whatever it empties. Written
 * whole-object: package names contain dots that would break dot-path writes.
 *
 * @param {OverrideKind} kind - The registry kind.
 * @param {string} name - The entry name: network name, package name, or token id.
 * @param {OverrideEntry} patch - Fields to merge into the entry; a field set to undefined is removed.
 * @returns {void}
 */
export function setOverride (kind, name, patch) {
  const overrides = getOverrides()
  /** @type {Record<string, unknown>} */
  const entry = { ...overrides[kind]?.[name], ...patch }
  for (const key of Object.keys(entry)) {
    if (entry[key] === undefined) delete entry[key]
  }
  const entries = { ...overrides[kind] }
  if (Object.keys(entry).length === 0) delete entries[name]
  else entries[name] = /** @type {OverrideEntry} */ (entry)
  const next = { ...overrides }
  if (Object.keys(entries).length === 0) delete next[kind]
  else next[kind] = entries
  if (Object.keys(next).length === 0) configService.delete(OVERRIDES_KEY)
  else configService.set(OVERRIDES_KEY, next)
}

/**
 * Removes an override entry entirely.
 *
 * @param {OverrideKind} kind - The registry kind.
 * @param {string} name - The entry name: network name, package name, or token id.
 * @returns {void}
 */
export function clearOverride (kind, name) {
  const entry = getOverride(kind, name)
  if (!entry) return
  const patch = /** @type {OverrideEntry} */ ({})
  for (const key of Object.keys(entry)) patch[key] = undefined
  setOverride(kind, name, patch)
}

/**
 * Returns whether a built-in registry entry is disabled by an override.
 *
 * @param {OverrideKind} kind - The registry kind.
 * @param {string} name - The entry name: network name, package name, or token id.
 * @returns {boolean} True when the user disabled it.
 */
export function isDisabled (kind, name) {
  return getOverride(kind, name)?.enabled === false
}

/**
 * Applies an enable/disable decision to a registry entry: enabling a name that
 * only exists in overrides clears the stale entry, and a no-op is rejected so
 * the caller never reports a change that did not happen.
 *
 * @param {OverrideKind} kind - The registry kind.
 * @param {string} name - The entry name: network name, package name, or token id.
 * @param {boolean} enabled - The desired state.
 * @param {boolean} known - Whether the entry exists in the registry.
 * @param {WdkCliError} unknownError - The error to throw when it does not.
 * @returns {boolean} True when a stale override was cleared instead.
 * @throws {WdkCliError} When the entry is unknown or already in the desired state.
 */
export function setEnabled (kind, name, enabled, known, unknownError) {
  if (!known) {
    if (enabled && getOverride(kind, name)) {
      clearOverride(kind, name)
      return true
    }
    throw unknownError
  }
  if (enabled === !isDisabled(kind, name)) {
    throw new WdkCliError(`'${name}' is already ${enabled ? 'enabled' : 'disabled'}.`, ErrorCode.INVALID_ARGUMENT)
  }
  setOverride(kind, name, { enabled: enabled ? undefined : false })
  return false
}
