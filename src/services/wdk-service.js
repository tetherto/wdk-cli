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

import WDK from '@tetherto/wdk'
import chalk from 'chalk'
import { isValidNetwork, getNetworkConfig, parseModuleName } from '../config/networks.js'
import { configService } from './config-service.js'
import { CONFIG_DEFAULTS } from '../config/constants.js'
import { WdkCliError, ErrorCode, isNetworkError } from '../errors/index.js'

/** @typedef {typeof import('@tetherto/wdk-wallet').default} WalletManagerCtor */
/** @typedef {import('@tetherto/wdk').IWalletAccountWithProtocols} WalletAccount */

/** @type {Map<string, WalletManagerCtor>} */
const walletManagerCache = new Map()

/**
 * Dynamically imports a wallet manager module, with optional version check.
 *
 * @param {string} moduleSpec - The npm module specifier, e.g. `@tetherto/wdk-wallet` or `@scope/pkg@1.2.3`.
 * @returns {Promise<WalletManagerCtor>} The default export of the wallet manager module.
 */
async function loadWalletManager (moduleSpec) {
  const cached = walletManagerCache.get(moduleSpec)
  if (cached) return cached

  const { name, version } = parseModuleName(moduleSpec)

  try {
    const mod = await import(name)
    /** @type {WalletManagerCtor} */
    const Manager = mod.default || mod

    if (version) {
      try {
        const { createRequire } = await import('node:module')
        const require = createRequire(import.meta.url)
        const pkg = require(`${name}/package.json`)
        if (pkg.version && pkg.version !== version) {
          console.error(
            chalk.yellow(
              `Warning: ${name} installed ${pkg.version}, config expects ${version}. Run: npm install ${moduleSpec}`
            )
          )
        }
      } catch {
        /* skip check if package.json not readable */
      }
    }

    walletManagerCache.set(moduleSpec, Manager)
    return Manager
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'MODULE_NOT_FOUND') {
      throw new WdkCliError(
        `Wallet module '${moduleSpec}' is not installed.`,
        ErrorCode.UNSUPPORTED_MODULE,
        `Install it with: npm install ${moduleSpec}`
      )
    }
    throw err
  }
}

export class WdkService {
  constructor () {
    /** @type {WDK | null} */
    this.wdk = null
    /** @type {Set<string>} */
    this.registeredNetworks = new Set()
    /** @type {Map<string, WalletAccount>} */
    this.accountCache = new Map()
  }

  /**
   * Creates the underlying WDK instance from a seed phrase (no-op if already created).
   *
   * @param {string} seedPhrase - The BIP-39 seed phrase.
   * @returns {void}
   */
  createInstance (seedPhrase) {
    if (!this.wdk) {
      this.wdk = new WDK(seedPhrase)
    }
  }

  /**
   * Initialises the WDK instance and registers the given network.
   *
   * @param {string} seedPhrase - The BIP-39 seed phrase.
   * @param {string} network - The network name to register.
   * @returns {Promise<void>}
   */
  async initialize (seedPhrase, network) {
    if (!isValidNetwork(network)) {
      throw new WdkCliError(
        `Network '${network}' is not supported.`,
        ErrorCode.NETWORK_NOT_SUPPORTED
      )
    }

    this.createInstance(seedPhrase)

    if (!this.registeredNetworks.has(network)) {
      await this.#registerNetwork(network)
    }
  }

  /**
   * Registers a network's wallet manager with the WDK instance.
   *
   * @param {string} network - The network name to register.
   * @returns {Promise<void>}
   */
  async #registerNetwork (network) {
    if (!this.wdk) throw new WdkCliError('WDK not initialized.', ErrorCode.UNEXPECTED_ERROR)

    const networkConfig = getNetworkConfig(network)
    const WalletManager = await loadWalletManager(networkConfig.module)

    const networkDefaults = CONFIG_DEFAULTS.networks || {}
    const fromService = configService.get(`networks.${network}`)
    const sdkConfig = fromService || networkDefaults[network] || {}

    this.wdk.registerWallet(network, WalletManager, sdkConfig)
    this.registeredNetworks.add(network)
  }

  /**
   * Returns the wallet account for the given network and index, with caching.
   *
   * @param {string} network - The network name.
   * @param {number} [index] - The BIP-44 account index.
   * @returns {Promise<WalletAccount>} The wallet account instance.
   */
  async getAccount (network, index = 0) {
    if (!this.wdk) {
      throw new WdkCliError(
        'WDK not initialized. Call initialize() first.',
        ErrorCode.UNEXPECTED_ERROR
      )
    }

    const cacheKey = `${network}:${index}`
    if (this.accountCache.has(cacheKey)) {
      return this.accountCache.get(cacheKey)
    }

    if (!this.registeredNetworks.has(network)) {
      await this.#registerNetwork(network)
    }

    try {
      const account = await this.wdk.getAccount(network, index)
      this.accountCache.set(cacheKey, account)
      return account
    } catch (error) {
      if (isNetworkError(error)) {
        throw new WdkCliError(`Cannot reach ${network}.`, ErrorCode.NETWORK_ERROR)
      }
      throw error
    }
  }

  /**
   * Returns the current fee rates for a network.
   *
   * @param {string} network - The network name.
   * @returns {Promise<{ normal: bigint, fast: bigint }>} The fee rates.
   */
  async getFeeRates (network) {
    if (!this.wdk) {
      throw new WdkCliError(
        'WDK not initialized. Call initialize() first.',
        ErrorCode.UNEXPECTED_ERROR
      )
    }
    return this.wdk.getFeeRates(network)
  }

  /**
   * Disposes the WDK instance and clears all caches.
   *
   * @returns {void}
   */
  dispose () {
    if (this.wdk) {
      this.wdk.dispose()
      this.wdk = null
      this.registeredNetworks.clear()
      this.accountCache.clear()
    }
  }
}
