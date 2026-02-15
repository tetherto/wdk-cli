import { wdkService } from './wdk-service.js'
import { solanaService } from './solana-service.js'
import { KeyService } from './key-service.js'
import { Keyring } from '../security/keyring.js'
import { sessionService } from './session-service.js'
import { configService } from './config-service.js'
import { CHAINS, isSolanaChain } from '../config/chains.js'
import { getKeyringPath } from '../config/constants.js'
import { KeyNotFoundError } from '../errors/index.js'
import { promptPassword } from '../ui/prompts.js'
import type { ChainName } from '../types/index.js'

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

async function ensureInitialized(chain: ChainName): Promise<void> {
  const seedPhrase = await getSeedPhrase()
  if (isSolanaChain(chain)) {
    solanaService.initialize(seedPhrase)
  } else {
    await wdkService.initialize(seedPhrase, chain)
  }
}

export async function getAddress(chain: ChainName, index: number): Promise<string> {
  await ensureInitialized(chain)
  if (isSolanaChain(chain)) {
    return solanaService.getAddress(index)
  }
  const account = await wdkService.getAccount(chain, index)
  return account.getAddress()
}

export async function walletInfo(
  chain: ChainName,
  index: number,
): Promise<{
  chain: ChainName
  index: number
  address: string
  balance: bigint
  displayName: string
  nativeSymbol: string
}> {
  await ensureInitialized(chain)
  let address: string
  let balance: bigint
  if (isSolanaChain(chain)) {
    address = solanaService.getAddress(index)
    balance = await solanaService.getBalance(chain, index)
  } else {
    const account = await wdkService.getAccount(chain, index)
    address = await account.getAddress()
    balance = await account.getBalance()
  }
  const chainConfig = CHAINS[chain]

  return {
    chain,
    index,
    address,
    balance,
    displayName: chainConfig.displayName,
    nativeSymbol: chainConfig.nativeSymbol,
  }
}

export async function getBalance(
  chain: ChainName,
  index: number,
  token?: string,
): Promise<{ balance: bigint; symbol: string; decimals: number }> {
  await ensureInitialized(chain)
  const chainConfig = CHAINS[chain]

  if (isSolanaChain(chain)) {
    const balance = await solanaService.getBalance(chain, index)
    return {
      balance,
      symbol: chainConfig.nativeSymbol,
      decimals: chainConfig.decimals,
    }
  }

  const account = await wdkService.getAccount(chain, index)

  if (token) {
    const balance: bigint = await account.getTokenBalance(token)
    return { balance, symbol: `ERC20:${token.slice(0, 8)}`, decimals: 18 }
  }

  const balance: bigint = await account.getBalance()
  return {
    balance,
    symbol: chainConfig.nativeSymbol,
    decimals: chainConfig.decimals,
  }
}

export function resolveChain(optionChain?: string): ChainName {
  if (optionChain) return optionChain as ChainName
  return (configService.get('defaultChain') as ChainName) || 'ethereum'
}

export function resolveIndex(optionIndex?: string): number {
  if (optionIndex !== undefined) return parseInt(optionIndex, 10)
  return (configService.get('defaultIndex') as number) || 0
}
