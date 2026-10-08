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

import { chmodSync } from 'node:fs'
import Conf from 'conf'
import { APP_NAME, CONFIG_DEFAULTS, getConfigDir } from '../config/constants.js'

/**
 * Narrows the config directory to the owner. The files inside carry provider
 * credentials and wallet names; without this another local account can read
 * them. Windows has no POSIX mode and uses a per-user ACL instead, and a
 * directory on a read-only mount cannot be changed — neither is worth failing
 * a command over.
 *
 * @returns {void}
 */
function restrictConfigDir () {
  if (process.platform === 'win32') return
  try {
    chmodSync(getConfigDir(), 0o700)
  } catch {
    // Best effort: the config itself is already written owner-only.
  }
}

/** Persistent user-config store backed by `Conf`. */
class ConfigService {
  constructor () {
    this.conf = new Conf({
      projectName: APP_NAME,
      cwd: getConfigDir(),
      // Owner-only: this file holds provider API keys in clear text.
      configFileMode: 0o600,
      defaults: CONFIG_DEFAULTS
    })
    restrictConfigDir()
  }

  /**
   * Retrieves a config value by key.
   *
   * @param {string} key - The dot-separated config key.
   * @returns {unknown} The config value, or undefined if not set.
   */
  get (key) {
    return this.conf.get(key)
  }

  /**
   * Sets a config value by key.
   *
   * @param {string} key - The dot-separated config key.
   * @param {unknown} value - The value to set.
   * @returns {void}
   */
  set (key, value) {
    this.conf.set(key, value)
  }

  /**
   * Deletes a config value by key.
   *
   * @param {string} key - The dot-separated config key to delete.
   * @returns {void}
   */
  delete (key) {
    this.conf.delete(key)
  }

  /**
   * Clears all config values, restoring the factory defaults from `CONFIG_DEFAULTS`.
   *
   * @returns {void}
   */
  clear () {
    this.conf.clear()
  }

  /**
   * Returns the full config store. Excludes `customTokens` — tokens are their
   * own registry (`wdk token list`), not configuration.
   *
   * @returns {Record<string, unknown>} The config object.
   */
  list () {
    const { customTokens: _ct, ...config } = { ...this.conf.store }
    return config
  }

  /**
   * Returns the default wallet name.
   *
   * @returns {string} The default wallet name, or empty string if not set.
   */
  getDefaultWallet () {
    return /** @type {string | undefined} */ (this.get('defaultWallet')) || ''
  }

  /**
   * Sets the default wallet name.
   *
   * @param {string} name - The wallet name to set as default.
   * @returns {void}
   */
  setDefaultWallet (name) {
    this.conf.set('defaultWallet', name)
  }

  /**
   * Returns the default BIP-44 account index.
   *
   * @returns {number} The default account index, or 0 if not set.
   */
  getDefaultIndex () {
    return /** @type {number | undefined} */ (this.get('defaultIndex')) || 0
  }

  /**
   * Sets the default BIP-44 account index.
   *
   * @param {number} index - The account index to set as default.
   * @returns {void}
   */
  setDefaultIndex (index) {
    this.conf.set('defaultIndex', index)
  }

  /**
   * The absolute path to the config file on disk.
   *
   * @type {string}
   */
  get configPath () {
    return this.conf.path
  }
}

export const configService = new ConfigService()

/**
 * Resolves the account index, falling back to the configured default when omitted.
 *
 * @param {number | undefined} optionIndex - The parsed --index CLI option value.
 * @returns {number} The resolved account index.
 */
export function resolveIndex (optionIndex) {
  return optionIndex ?? configService.getDefaultIndex()
}
