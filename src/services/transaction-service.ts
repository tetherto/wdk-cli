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

import { wdkService } from './wdk-service.js'
import { getSeedPhrase } from './auth-service.js'
import { configService } from './config-service.js'
import { getNetworkConfig } from '../config/networks.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import type { NetworkName, TxResult } from '../types/index.js'

export async function ensureInitialized(network: NetworkName, wallet: string = configService.getDefaultWallet()): Promise<void> {
  const seedPhrase = await getSeedPhrase(wallet)
  await wdkService.initialize(seedPhrase, network)
}

export interface SendOptions {
  network: NetworkName
  index: number
  to: string
  amount: string
  token?: string
  wallet?: string
}

export interface FeeQuote {
  fee: bigint
  feeFormatted: string
}

export async function estimateFee(options: SendOptions): Promise<FeeQuote> {
  await ensureInitialized(options.network, options.wallet)
  const networkConfig = getNetworkConfig(options.network)
  let fee: bigint

  if (options.token) {
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
  const divisor = 10n ** BigInt(decimals)
  const whole = fee / divisor
  const remainder = fee % divisor
  const decimal = remainder.toString().padStart(decimals, '0').replace(/0+$/, '') || '0'
  const feeFormatted = `${whole}.${decimal.slice(0, 8)} ${networkConfig.nativeSymbol}`

  return { fee, feeFormatted }
}

export async function send(options: SendOptions): Promise<TxResult> {
  const networkConfig = getNetworkConfig(options.network)
  const sendAmount = BigInt(options.amount)

  const account = await wdkService.getAccount(options.network, options.index)
  const balance = await account.getBalance()

  if (options.token) {
    const tokenBalance = await account.getTokenBalance(options.token)
    if (tokenBalance < sendAmount) {
      throw new WdkCliError(`Insufficient balance. Have ${tokenBalance} tokens, need ${sendAmount} tokens (+ fee).`, ErrorCode.INSUFFICIENT_BALANCE)
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
      throw new WdkCliError(`Transaction failed: ${msg}`, ErrorCode.TRANSACTION_FAILED)
    }
  } else {
    if (balance < sendAmount) {
      throw new WdkCliError(`Insufficient balance. Have ${balance} ${networkConfig.nativeSymbol}, need ${sendAmount} ${networkConfig.nativeSymbol} (+ fee).`, ErrorCode.INSUFFICIENT_BALANCE)
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
        throw new WdkCliError(`Insufficient balance. Have ${balance} ${networkConfig.nativeSymbol}, need ${sendAmount} ${networkConfig.nativeSymbol} (+ fee).`, ErrorCode.INSUFFICIENT_BALANCE)
      }
      throw new WdkCliError(`Transaction failed: ${msg}`, ErrorCode.TRANSACTION_FAILED)
    }
  }
}
