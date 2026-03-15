import WDK from '@tetherto/wdk'
import WalletManagerBtc from '@tetherto/wdk-wallet-btc'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import WalletManagerSolana from '@tetherto/wdk-wallet-solana'
import WalletManagerSpark from '@tetherto/wdk-wallet-spark'
import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337'
import WalletManagerTron from '@tetherto/wdk-wallet-tron'
import { isValidNetwork, getNetworkConfig } from '../config/networks.js'
import { configService } from './config-service.js'
import { NetworkNotSupportedError, NetworkError } from '../errors/index.js'
import type { NetworkName, NetworkType } from '../types/index.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WALLET_MANAGERS: Record<NetworkType, any> = {
  'wdk-wallet-evm': WalletManagerEvm,
  'wdk-wallet-btc': WalletManagerBtc,
  'wdk-wallet-solana': WalletManagerSolana,
  'wdk-wallet-spark': WalletManagerSpark,
  'wdk-wallet-evm-erc-4337': WalletManagerEvmErc4337,
  'wdk-wallet-tron': WalletManagerTron,
}

export function transformConfig(type: NetworkType, raw: Record<string, unknown>, network: string): Record<string, unknown> {
  const config = { ...raw }

  for (const [key, value] of Object.entries(config)) {
    if (value === '') delete config[key]
  }

  if (type === 'wdk-wallet-solana') {
    config.rpcUrl = configService.getProviderUrl(network)
    delete config.provider
  } else if (type === 'wdk-wallet-spark') {
    if (config.sparkNetwork) {
      config.network = config.sparkNetwork
      delete config.sparkNetwork
    }
  } else if (type === 'wdk-wallet-tron') {
    config.provider = configService.getProviderUrl(network)
  } else if (type === 'wdk-wallet-evm' || type === 'wdk-wallet-evm-erc-4337') {
    config.provider = configService.getProviderUrl(network)
  }

  if (type === 'wdk-wallet-evm-erc-4337') {
    const mode = (config.mode as string) || 'paymasterToken'
    delete config.mode

    if (mode === 'sponsored') {
      config.isSponsored = true
      delete config.useNativeCoins
      delete config.paymasterToken
      delete config.paymasterAddress
    } else if (mode === 'nativeCoins') {
      config.useNativeCoins = true
      delete config.isSponsored
      delete config.paymasterToken
      delete config.paymasterAddress
      delete config.paymasterUrl
      delete config.sponsorshipPolicyId
    } else {
      delete config.isSponsored
      delete config.useNativeCoins
      delete config.sponsorshipPolicyId
    }
  }

  if (config.transferMaxFee) {
    try {
      config.transferMaxFee = BigInt(config.transferMaxFee as string | number)
    } catch {
      delete config.transferMaxFee
    }
  }

  if (config.paymasterToken && typeof config.paymasterToken === 'string') {
    config.paymasterToken = { address: config.paymasterToken }
  }

  return config
}

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

    const networkConfig = getNetworkConfig(network)
    const WalletManager = WALLET_MANAGERS[networkConfig.type]
    if (!WalletManager) throw new NetworkNotSupportedError(network)

    const rawConfig = { ...(configService.get(`networks.${network}`) as Record<string, unknown> || {}) }
    const sdkConfig = transformConfig(networkConfig.type, rawConfig, network)

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
      this.registerNetwork(network)
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
