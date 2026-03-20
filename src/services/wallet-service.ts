import { wdkService } from './wdk-service.js'
import { configService } from './config-service.js'
import { getSeedPhrase } from './auth-service.js'
import { DEFAULT_WALLET } from '../config/constants.js'
import { getNetworkConfig } from '../config/networks.js'
import { getTokenConfig } from '../config/tokens.js'
import { MissingNetworkError, WdkCliError } from '../errors/index.js'

import type { NetworkName } from '../types/index.js'

async function ensureInitialized(network: NetworkName, wallet: string = DEFAULT_WALLET): Promise<void> {
  const seedPhrase = await getSeedPhrase(wallet)
  await wdkService.initialize(seedPhrase, network)
}

export async function getAddress(network: NetworkName, index: number, wallet: string = DEFAULT_WALLET): Promise<string> {
  await ensureInitialized(network, wallet)
  const account = await wdkService.getAccount(network, index)
  return account.getAddress()
}

export async function getBalance(
  network: NetworkName,
  index: number,
  token?: string,
  wallet: string = DEFAULT_WALLET,
): Promise<{ balance: bigint; symbol: string; decimals: number }> {
  await ensureInitialized(network, wallet)
  const networkConfig = getNetworkConfig(network)

  const account = await wdkService.getAccount(network, index)

  if (token) {
    try {
      const balance: bigint = await account.getTokenBalance(token)
      const config = getTokenConfig(network, token)
      if (config) {
        return { balance, symbol: config.symbol, decimals: config.decimals }
      }
      return { balance, symbol: 'tokens', decimals: 0 }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('BAD_DATA') || msg.includes('could not decode result') || msg.includes('AccountNotFound')) {
        throw new WdkCliError(
          `Not a valid token contract: ${token}`,
          'INVALID_TOKEN',
          'Make sure the address is a token contract, not a wallet address.',
        )
      }
      throw error
    }
  }

  const balance: bigint = await account.getBalance()
  return {
    balance,
    symbol: networkConfig.nativeSymbol,
    decimals: networkConfig.decimals,
  }
}

export function resolveNetwork(optionNetwork?: string): NetworkName {
  if (optionNetwork) return optionNetwork as NetworkName
  throw new MissingNetworkError()
}

export function resolveIndex(optionIndex?: string): number {
  if (optionIndex !== undefined) {
    const index = parseInt(optionIndex, 10)
    if (isNaN(index) || index < 0) {
      throw new WdkCliError('Invalid account index. Must be a non-negative integer.', 'INVALID_INDEX')
    }
    return index
  }
  return (configService.get('defaultIndex') as number) || 0
}
