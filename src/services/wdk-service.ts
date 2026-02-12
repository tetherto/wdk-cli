import WDK from '@tetherto/wdk'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { CHAINS, isEvmChain } from '../config/chains.js'
import { configService } from './config-service.js'
import { ChainNotSupportedError, NetworkError } from '../errors/index.js'
import type { ChainName } from '../types/index.js'

// WDK SDK is JS with JSDoc types — use any for account objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WdkAccount = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WDKAny = WDK as any

export class WdkService {
  private wdk: WDK | null = null
  private registeredChains = new Set<ChainName>()
  private accountCache = new Map<string, WdkAccount>()

  async initialize(seedPhrase: string, chain: ChainName): Promise<void> {
    if (!(chain in CHAINS)) {
      throw new ChainNotSupportedError(chain)
    }

    if (!this.wdk) {
      this.wdk = new WDKAny(seedPhrase)
    }

    if (!this.registeredChains.has(chain)) {
      this.registerChain(chain)
    }
  }

  private registerChain(chain: ChainName): void {
    if (!this.wdk) throw new Error('WDK not initialized')

    const providerUrl = configService.getProviderUrl(chain)
    const chainConfig = CHAINS[chain]

    // Use 'as any' for registerWallet — WDK's JSDoc-generated types
    // don't perfectly represent the runtime config shapes
    if (isEvmChain(chain)) {
      const maxFee = configService.get('evm.transferMaxFee') as string | undefined
      ;(this.wdk as any).registerWallet(chain, WalletManagerEvm, {
        provider: providerUrl,
        ...(maxFee ? { transferMaxFee: BigInt(maxFee) } : {}),
      })
    } else {
      ;(this.wdk as any).registerWallet(chain, WalletManagerBtc, {
        provider: providerUrl,
        network: chain === 'bitcoin' ? 'bitcoin' : 'testnet',
      })
    }

    this.registeredChains.add(chain)
  }

  async getAccount(chain: ChainName, index: number = 0): Promise<WdkAccount> {
    if (!this.wdk) {
      throw new Error('WDK not initialized. Call initialize() first.')
    }

    const cacheKey = `${chain}:${index}`
    if (this.accountCache.has(cacheKey)) {
      return this.accountCache.get(cacheKey)!
    }

    if (!this.registeredChains.has(chain)) {
      this.registerChain(chain)
    }

    try {
      const account = await this.wdk.getAccount(chain, index)
      this.accountCache.set(cacheKey, account)
      return account
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
        throw new NetworkError(configService.getProviderUrl(chain))
      }
      throw error
    }
  }

  async getFeeRates(chain: ChainName): Promise<{ normal: bigint; fast: bigint }> {
    if (!this.wdk) {
      throw new Error('WDK not initialized. Call initialize() first.')
    }
    return this.wdk.getFeeRates(chain)
  }

  dispose(): void {
    if (this.wdk) {
      this.wdk.dispose()
      this.wdk = null
      this.registeredChains.clear()
      this.accountCache.clear()
    }
  }
}

// Singleton instance
export const wdkService = new WdkService()
