import { wdkService } from './wdk-service.js'
import { solanaService } from './solana-service.js'
import { KeyService } from './key-service.js'
import { Keyring } from '../security/keyring.js'
import { sessionService } from './session-service.js'
import { NETWORKS, isEvmNetwork, isSolanaNetwork } from '../config/networks.js'
import { getKeyringPath } from '../config/constants.js'
import { KeyNotFoundError, InsufficientBalanceError, TransactionFailedError } from '../errors/index.js'
import { promptPassword } from '../ui/prompts.js'
import type { NetworkName, TxResult } from '../types/index.js'

const keyService = new KeyService(new Keyring(getKeyringPath()))

async function getSeedPhrase(): Promise<string> {
  if (!(await keyService.hasKey())) {
    throw new KeyNotFoundError()
  }

  const cached = await sessionService.get()
  if (cached) return cached

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

export interface SendOptions {
  network: NetworkName
  index: number
  to: string
  amount: string
  token?: string
  maxFee?: string
}

export interface FeeQuote {
  fee: bigint
  feeFormatted: string
}

export async function estimateFee(options: SendOptions): Promise<FeeQuote> {
  await ensureInitialized(options.network)
  const networkConfig = NETWORKS[options.network]
  let fee: bigint

  if (isSolanaNetwork(options.network)) {
    fee = await solanaService.estimateFee(options.network)
  } else if (options.token && isEvmNetwork(options.network)) {
    const account = await wdkService.getAccount(options.network, options.index)
    const quote = await account.quoteTransfer({
      token: options.token,
      recipient: options.to,
      amount: BigInt(options.amount),
    })
    fee = quote.fee
  } else {
    const account = await wdkService.getAccount(options.network, options.index)
    const quote = await account.quoteSendTransaction({
      to: options.to,
      value: BigInt(options.amount),
    })
    fee = quote.fee
  }

  const decimals = networkConfig.decimals
  const divisor = BigInt(10 ** decimals)
  const whole = fee / divisor
  const remainder = fee % divisor
  const decimal = remainder.toString().padStart(decimals, '0').replace(/0+$/, '') || '0'
  const feeFormatted = `${whole}.${decimal.slice(0, 8)} ${networkConfig.nativeSymbol}`

  return { fee, feeFormatted }
}

export async function send(options: SendOptions): Promise<TxResult> {
  const networkConfig = NETWORKS[options.network]
  const sendAmount = BigInt(options.amount)

  if (isSolanaNetwork(options.network)) {
    const from = solanaService.getAddress(options.index)
    const balance = await solanaService.getBalance(options.network, options.index)
    if (balance < sendAmount) {
      throw new InsufficientBalanceError(
        balance.toString(),
        sendAmount.toString(),
        networkConfig.nativeSymbol,
      )
    }
    try {
      const result = await solanaService.sendTransaction(options.network, options.index, options.to, sendAmount)
      return {
        txHash: result.hash,
        network: options.network,
        from,
        to: options.to,
        amount: options.amount,
        fee: result.fee.toString(),
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new TransactionFailedError(msg)
    }
  }

  // ensureInitialized already called during fee estimation, but re-init is cached
  const account = await wdkService.getAccount(options.network, options.index)
  const balance = await account.getBalance()

  if (options.token && isEvmNetwork(options.network)) {
    const tokenBalance = await account.getTokenBalance(options.token)
    if (tokenBalance < sendAmount) {
      throw new InsufficientBalanceError(
        tokenBalance.toString(),
        sendAmount.toString(),
        'tokens',
      )
    }
    try {
      const result = await account.transfer({
        token: options.token,
        recipient: options.to,
        amount: sendAmount,
      })
      const from = await account.getAddress()
      return {
        txHash: result.hash,
        network: options.network,
        from,
        to: options.to,
        amount: options.amount,
        fee: result.fee?.toString(),
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new TransactionFailedError(msg)
    }
  } else {
    if (balance < sendAmount) {
      throw new InsufficientBalanceError(
        balance.toString(),
        sendAmount.toString(),
        networkConfig.nativeSymbol,
      )
    }
    try {
      const result = await account.sendTransaction({
        to: options.to,
        value: sendAmount,
      })
      const from = await account.getAddress()
      return {
        txHash: result.hash,
        network: options.network,
        from,
        to: options.to,
        amount: options.amount,
        fee: result.fee?.toString(),
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('insufficient funds')) {
        throw new InsufficientBalanceError(
          balance.toString(),
          sendAmount.toString(),
          networkConfig.nativeSymbol,
        )
      }
      throw new TransactionFailedError(msg)
    }
  }
}
