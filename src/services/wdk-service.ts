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
import { isValidNetwork, getNetworkConfig, parseModuleName } from '../config/networks.js'
import { configService } from './config-service.js'
import { CONFIG_DEFAULTS } from '../config/constants.js'
import { WdkCliError, ErrorCode, isNetworkError } from '../errors/index.js'
import type { NetworkName } from '../types/index.js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const walletManagerCache = new Map<string, any>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadWalletManager(moduleSpec: string): Promise<any> {
  if (walletManagerCache.has(moduleSpec)) {
    return walletManagerCache.get(moduleSpec)
  }

  const { name, version } = parseModuleName(moduleSpec)

  try {
    const mod = await import(name)
    const Manager = mod.default || mod

    if (version) {
      try {
        const { createRequire } = await import('node:module')
        const require = createRequire(import.meta.url)
        const pkg = require(`${name}/package.json`)
        if (pkg.version && pkg.version !== version) {
          console.warn(`Warning: ${name} installed ${pkg.version}, config expects ${version}. Run: npm install ${moduleSpec}`)
        }
      } catch { /* skip check if package.json not readable */ }
    }

    walletManagerCache.set(moduleSpec, Manager)
    return Manager
  } catch (err) {
    const error = err as NodeJS.ErrnoException
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        `Wallet module '${moduleSpec}' is not installed.\n` +
        `Install it with: npm install ${moduleSpec}`
      )
    }
    throw err
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WdkAccount = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WDKAny = WDK as any

export class WdkService {
  private wdk: WDK | null = null
  private registeredNetworks = new Set<string>()
  private accountCache = new Map<string, WdkAccount>()

  createInstance(seedPhrase: string): void {
    if (!this.wdk) {
      this.wdk = new WDKAny(seedPhrase)
    }
  }

  async initialize(seedPhrase: string, network: NetworkName): Promise<void> {
    if (!isValidNetwork(network)) {
      throw new WdkCliError(`Network '${network}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
    }

    this.createInstance(seedPhrase)

    if (!this.registeredNetworks.has(network)) {
      await this.registerNetwork(network)
    }
  }

  private async registerNetwork(network: NetworkName): Promise<void> {
    if (!this.wdk) throw new Error('WDK not initialized')

    const networkConfig = getNetworkConfig(network)
    const WalletManager = await loadWalletManager(networkConfig.module)
    if (!WalletManager) throw new WdkCliError(`Network '${network}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)

    const networkDefaults = (CONFIG_DEFAULTS as Record<string, unknown>).networks as Record<string, Record<string, unknown>> || {}
    const fromService = configService.get<Record<string, unknown>>(`networks.${network}`)
    const sdkConfig = fromService || networkDefaults[network] || {}

    ;(this.wdk as typeof WDKAny).registerWallet(network, WalletManager, sdkConfig)
    this.registeredNetworks.add(network)
  }

  async getAccount(network: NetworkName, index: number = 0): Promise<WdkAccount> {
    if (!this.wdk) {
      throw new Error('WDK not initialized. Call initialize() first.')
    }

    const cacheKey = `${network}:${index}`
    if (this.accountCache.has(cacheKey)) {
      return this.accountCache.get(cacheKey)!
    }

    if (!this.registeredNetworks.has(network)) {
      await this.registerNetwork(network)
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

  async getFeeRates(network: NetworkName): Promise<{ normal: bigint; fast: bigint }> {
    if (!this.wdk) {
      throw new Error('WDK not initialized. Call initialize() first.')
    }
    return this.wdk.getFeeRates(network)
  }

  dispose(): void {
    if (this.wdk) {
      this.wdk.dispose()
      this.wdk = null
      this.registeredNetworks.clear()
      this.accountCache.clear()
    }
  }
}
