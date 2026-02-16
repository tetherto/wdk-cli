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
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'
import { isValidNetwork, isEvmNetwork, isSolanaNetwork, isBtcNetwork } from '../config/networks.js'
import { configService } from './config-service.js'
import { NetworkNotSupportedError, NetworkError } from '../errors/index.js'
import type { NetworkName } from '../types/index.js'

// WDK SDK is JS with JSDoc types — use any for account objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WdkAccount = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WDKAny = WDK as any

export class WdkService {
  private wdk: WDK | null = null
  private registeredNetworks = new Set<NetworkName>()
  private accountCache = new Map<string, WdkAccount>()

  async initialize(seedPhrase: string, network: NetworkName): Promise<void> {
    if (!isValidNetwork(network)) {
      throw new NetworkNotSupportedError(network)
    }

    if (!this.wdk) {
      this.wdk = new WDKAny(seedPhrase)
    }

    if (!this.registeredNetworks.has(network)) {
      this.registerNetwork(network)
    }
  }

  private registerNetwork(network: NetworkName): void {
    if (!this.wdk) throw new Error('WDK not initialized')

    // Use 'as any' for registerWallet — WDK's JSDoc-generated types
    // don't perfectly represent the runtime config shapes
    if (isEvmNetwork(network)) {
      const providerUrl = configService.getProviderUrl(network)
      const maxFee = configService.get(`networks.${network}.transferMaxFee`) as string | undefined
      ;(this.wdk as typeof WDKAny).registerWallet(network, WalletManagerEvm, {
        provider: providerUrl,
        ...(maxFee ? { transferMaxFee: BigInt(maxFee) } : {}),
      })
    } else if (isSolanaNetwork(network)) {
      const providerUrl = configService.getProviderUrl(network)
      ;(this.wdk as typeof WDKAny).registerWallet(network, WalletManagerSolana, {
        rpcUrl: providerUrl,
      })
    } else if (isBtcNetwork(network)) {
      const host = (configService.get(`networks.${network}.host`) as string) || undefined
      const port = (configService.get(`networks.${network}.port`) as number) || undefined
      const protocol = (configService.get(`networks.${network}.protocol`) as string) || undefined
      const btcNetwork = (configService.get(`networks.${network}.network`) as string) || (network === 'bitcoin' ? 'bitcoin' : 'testnet')
      const bip = (configService.get(`networks.${network}.bip`) as number) || undefined
      ;(this.wdk as typeof WDKAny).registerWallet(network, WalletManagerBtc, {
        ...(host ? { host } : {}),
        ...(port ? { port } : {}),
        ...(protocol ? { protocol } : {}),
        ...(bip ? { bip } : {}),
        network: btcNetwork,
      })
    } else {
      throw new NetworkNotSupportedError(network)
    }

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
      this.registerNetwork(network)
    }

    try {
      const account = await this.wdk.getAccount(network, index)
      this.accountCache.set(cacheKey, account)
      return account
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
        throw new NetworkError(configService.getProviderUrl(network))
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

// Singleton instance
export const wdkService = new WdkService()
