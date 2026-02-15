import { wdkService } from './wdk-service.js'
import { solanaService } from './solana-service.js'
import { KeyService } from './key-service.js'
import { Keyring } from '../security/keyring.js'
import { sessionService } from './session-service.js'
import { configService } from './config-service.js'
import { getNetworkConfig, isSolanaNetwork } from '../config/networks.js'
import { getKeyringPath } from '../config/constants.js'
import { KeyNotFoundError, MissingNetworkError } from '../errors/index.js'
import { promptPassword } from '../ui/prompts.js'
import type { NetworkName } from '../types/index.js'

const keyService = new KeyService(new Keyring(getKeyringPath()))

async function getSeedPhrase(): Promise<string> {
  if (!(await keyService.hasKey())) {
    throw new KeyNotFoundError()
  }

  // Check active session first
  const cached = await sessionService.get()
  if (cached) return cached

  // No session — prompt for password
  const password = await promptPassword('Enter password to unlock wallet:')
  return keyService.unlock(password)
}

async function ensureInitialized(network: NetworkName): Promise<void> {
  const seedPhrase = await getSeedPhrase()
  if (isSolanaNetwork(network)) {
    solanaService.initialize(seedPhrase)
  } else {
    await wdkService.initialize(seedPhrase, network)
  }
}

export async function getAddress(network: NetworkName, index: number): Promise<string> {
  await ensureInitialized(network)
  if (isSolanaNetwork(network)) {
    return solanaService.getAddress(index)
  }
  const account = await wdkService.getAccount(network, index)
  return account.getAddress()
}

export async function getBalance(
  network: NetworkName,
  index: number,
  token?: string,
): Promise<{ balance: bigint; symbol: string; decimals: number }> {
  await ensureInitialized(network)
  const networkConfig = getNetworkConfig(network)

  if (isSolanaNetwork(network)) {
    const balance = await solanaService.getBalance(network, index)
    return {
      balance,
      symbol: networkConfig.nativeSymbol,
      decimals: networkConfig.decimals,
    }
  }

  const account = await wdkService.getAccount(network, index)

  if (token) {
    const balance: bigint = await account.getTokenBalance(token)
    return { balance, symbol: `ERC20:${token.slice(0, 8)}`, decimals: 18 }
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
  if (optionIndex !== undefined) return parseInt(optionIndex, 10)
  return (configService.get('defaultIndex') as number) || 0
}
