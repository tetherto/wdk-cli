import WDK from '@tetherto/wdk'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { isValidNetwork, isEvmNetwork, getNetworkConfig } from '../config/networks.js'
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

    const providerUrl = configService.getProviderUrl(network)

    // Use 'as any' for registerWallet — WDK's JSDoc-generated types
    // don't perfectly represent the runtime config shapes
    if (isEvmNetwork(network)) {
      const maxFee = configService.get('evm.transferMaxFee') as string | undefined
      ;(this.wdk as any).registerWallet(network, WalletManagerEvm, {
        provider: providerUrl,
        ...(maxFee ? { transferMaxFee: BigInt(maxFee) } : {}),
      })
    } else {
      ;(this.wdk as any).registerWallet(network, WalletManagerBtc, {
        provider: providerUrl,
        network: network === 'bitcoin' ? 'bitcoin' : 'testnet',
      })
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
