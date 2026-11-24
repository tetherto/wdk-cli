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

/**
 * Where the user config lives. Each host provides one: the CLI, the MCP server
 * and the desktop daemon use the file-backed store from `./conf-store.js`; an
 * embedding host such as a mobile worklet can supply its own.
 *
 * @typedef {Object} ConfigStore
 * @property {(key: string) => unknown} get - Reads a value by dot-separated key.
 * @property {(key: string, value: unknown) => void} set - Writes a value by dot-separated key.
 * @property {(key: string) => void} delete - Removes a value by dot-separated key.
 * @property {() => void} clear - Restores the factory defaults.
 * @property {() => Record<string, unknown>} snapshot - Returns a copy of every stored value.
 * @property {string} path - Where the store keeps its data, for display.
 */

/** The user-config facade every service reads and writes through. */
class ConfigService {
  /** @type {ConfigStore | null} */
  #store = null

  /**
   * Sets the store this service reads and writes. Every host calls it once at
   * startup, before any config access.
   *
   * @param {ConfigStore} store - The config store.
   * @returns {void}
   */
  useStore (store) {
    this.#store = store
  }

  /**
   * The registered store.
   *
   * @type {ConfigStore}
   * @throws {Error} If no store has been registered.
   */
  get #current () {
    if (!this.#store) {
      throw new Error('No config store registered: call configService.useStore() at startup.')
    }
    return this.#store
  }

  /**
   * Retrieves a config value by key.
   *
   * @param {string} key - The dot-separated config key.
   * @returns {unknown} The config value, or undefined if not set.
   */
  get (key) {
    return this.#current.get(key)
  }

  /**
   * Sets a config value by key.
   *
   * @param {string} key - The dot-separated config key.
   * @param {unknown} value - The value to set.
   * @returns {void}
   */
  set (key, value) {
    this.#current.set(key, value)
  }

  /**
   * Deletes a config value by key.
   *
   * @param {string} key - The dot-separated config key to delete.
   * @returns {void}
   */
  delete (key) {
    this.#current.delete(key)
  }

  /**
   * Clears all config values, restoring the factory defaults.
   *
   * @returns {void}
   */
  clear () {
    this.#current.clear()
  }

  /**
   * Returns the full config store. Excludes `customTokens` — tokens are their
   * own registry (`wdk token list`), not configuration.
   *
   * @returns {Record<string, unknown>} The config object.
   */
  list () {
    const { customTokens: _ct, ...config } = this.#current.snapshot()
    return config
  }

  /**
   * Returns the default wallet name.
   *
   * @returns {string} The default wallet name, or empty string if not set.
   */
  getDefaultWallet () {
    const name = this.get('defaultWallet')
    return typeof name === 'string' ? name : ''
  }

  /**
   * Sets the default wallet name.
   *
   * @param {string} name - The wallet name to set as default.
   * @returns {void}
   */
  setDefaultWallet (name) {
    this.set('defaultWallet', name)
  }

  /**
   * Returns the default BIP-44 account index.
   *
   * @returns {number} The default account index, or 0 if not set.
   */
  getDefaultIndex () {
    const index = this.get('defaultIndex')
    return typeof index === 'number' ? index : 0
  }

  /**
   * Sets the default BIP-44 account index.
   *
   * @param {number} index - The account index to set as default.
   * @returns {void}
   */
  setDefaultIndex (index) {
    this.set('defaultIndex', index)
  }

  /**
   * Where the store keeps its data, for display.
   *
   * @type {string}
   */
  get configPath () {
    return this.#current.path
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
