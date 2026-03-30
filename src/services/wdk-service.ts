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
import { isValidNetwork, getNetworkConfig } from '../config/networks.js'
import { configService } from './config-service.js'
import { NetworkNotSupportedError, NetworkError } from '../errors/index.js'
import type { NetworkName } from '../types/index.js'
// Cache for dynamically loaded wallet manager modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const walletManagerCache = new Map<string, any>()

/**
 * Dynamically import a wallet manager module.
 * If the module is not installed, throws an error with install instructions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadWalletManager(moduleName: string): Promise<any> {
  if (walletManagerCache.has(moduleName)) {
    return walletManagerCache.get(moduleName)
  }

  try {
    const mod = await import(moduleName)
    const Manager = mod.default || mod
    walletManagerCache.set(moduleName, Manager)
    return Manager
  } catch (err) {
    const error = err as NodeJS.ErrnoException
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        `Wallet module '${moduleName}' is not installed.\n` +
        `Install it with: npm install ${moduleName}`
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

  isNetworkRegistered(network: NetworkName): boolean {
    return this.registeredNetworks.has(network)
  }

  async registerNetworkPublic(network: NetworkName): Promise<void> {
    await this.registerNetwork(network)
  }

  async initialize(seedPhrase: string, network: NetworkName): Promise<void> {
    if (!isValidNetwork(network)) {
      throw new NetworkNotSupportedError(network)
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
    if (!WalletManager) throw new NetworkNotSupportedError(network)

    const sdkConfig = configService.get(`networks.${network}`) as Record<string, unknown> || {}

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
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
        let connectionInfo: string = network
        try { connectionInfo = configService.getProviderUrl(network) } catch { /* no provider for this network type */ }
        throw new NetworkError(connectionInfo)
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

export const wdkService = new WdkService()
