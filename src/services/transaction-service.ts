import { wdkService } from './wdk-service.js'
import { KeyService } from './key-service.js'
import { Keyring } from '../security/keyring.js'
import { configService } from './config-service.js'
import { CHAINS, isEvmChain } from '../config/chains.js'
import { getKeyringPath } from '../config/constants.js'
import { KeyNotFoundError, InsufficientBalanceError, TransactionFailedError } from '../errors/index.js'
import { promptPassword } from '../ui/prompts.js'
import type { ChainName, TxResult } from '../types/index.js'

const keyService = new KeyService(new Keyring(getKeyringPath()))

async function ensureInitialized(chain: ChainName): Promise<void> {
  if (!(await keyService.hasKey())) {
    throw new KeyNotFoundError()
  }
  const password = await promptPassword('Enter password to unlock wallet:')
  const seedPhrase = await keyService.unlock(password)
  await wdkService.initialize(seedPhrase, chain)
}

export interface SendOptions {
  chain: ChainName
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
  await ensureInitialized(options.chain)
  const account = await wdkService.getAccount(options.chain, options.index)
  const chainConfig = CHAINS[options.chain]

  let fee: bigint

  if (options.token && isEvmChain(options.chain)) {
    // Token transfer fee estimation
    const quote = await account.quoteTransfer({
      token: options.token,
      recipient: options.to,
      amount: BigInt(options.amount),
    })
    fee = quote.fee
  } else {
    // Native send fee estimation
    const quote = await account.quoteSendTransaction({
      to: options.to,
      value: BigInt(options.amount),
    })
    fee = quote.fee
  }

  const decimals = chainConfig.decimals
  const divisor = BigInt(10 ** decimals)
  const whole = fee / divisor
  const remainder = fee % divisor
  const decimal = remainder.toString().padStart(decimals, '0').replace(/0+$/, '') || '0'
  const feeFormatted = `${whole}.${decimal.slice(0, 8)} ${chainConfig.nativeSymbol}`

  return { fee, feeFormatted }
}

export async function send(options: SendOptions): Promise<TxResult> {
  // ensureInitialized already called during fee estimation, but re-init is cached
  const account = await wdkService.getAccount(options.chain, options.index)
  const chainConfig = CHAINS[options.chain]

  // Check balance before sending
  const balance = await account.getBalance()
  const sendAmount = BigInt(options.amount)

  if (options.token && isEvmChain(options.chain)) {
    // Check token balance
    const tokenBalance = await account.getTokenBalance(options.token)
    if (tokenBalance < sendAmount) {
      throw new InsufficientBalanceError(
        tokenBalance.toString(),
        sendAmount.toString(),
        'tokens',
      )
    }

    // Execute token transfer
    try {
      const result = await account.transfer({
        token: options.token,
        recipient: options.to,
        amount: sendAmount,
      })
      const from = await account.getAddress()
      return {
        txHash: result.hash,
        chain: options.chain,
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
    // Native send — check native balance
    if (balance < sendAmount) {
      throw new InsufficientBalanceError(
        balance.toString(),
        sendAmount.toString(),
        chainConfig.nativeSymbol,
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
        chain: options.chain,
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
          chainConfig.nativeSymbol,
        )
      }
      throw new TransactionFailedError(msg)
    }
  }
}
