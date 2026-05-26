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

import { daemonClient } from '../daemon/client.js'
import { validateNetwork, getNetworkConfig } from '../config/networks.js'
import { convertToUsd } from '../services/price-service.js'
import { formatAmount, formatTokenAmount } from '../ui/formatters.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { withTimeout } from '../utils/async.js'
import { requireUnlockedWallet } from '../utils/wallet.js'

function validateAmount(amount) {
  if (!/^\d+$/.test(amount) || amount === '0') {
    throw new WdkCliError(
      'Invalid amount. Must be a positive integer in base units (wei/satoshis/lamports).',
      ErrorCode.INVALID_AMOUNT,
      'Do not use decimal points. Example: 1000000 for 1 USDT (6 decimals).'
    )
  }
}

export async function previewSend(input) {
  const wallet = await requireUnlockedWallet(input.wallet)
  validateNetwork(input.network)
  validateAmount(input.amount)

  const feeQuote = await withTimeout(
    daemonClient.estimateFee(input.network, input.index, input.to, input.amount, input.token, wallet),
    30_000,
    'Fee estimation'
  )

  const networkConfig = getNetworkConfig(input.network)
  const amountBigInt = BigInt(input.amount)
  const { formatted: amountFormatted, symbol: tokenSymbol } = formatTokenAmount(
    amountBigInt,
    input.amount,
    input.network,
    input.token
  )

  let amountUsd
  let estimatedFeeUsd
  try { amountUsd = await convertToUsd(input.network, amountBigInt, input.token) } catch { /* no price */ }
  try { estimatedFeeUsd = await convertToUsd(input.network, BigInt(feeQuote.fee)) } catch { /* no price */ }

  return {
    network: input.network,
    networkName: networkConfig.displayName,
    to: input.to,
    amount: input.amount,
    amountFormatted,
    amountUsd,
    token: input.token,
    tokenSymbol,
    estimatedFee: feeQuote.fee,
    estimatedFeeFormatted: feeQuote.feeFormatted,
    estimatedFeeUsd
  }
}

export async function executeSend(input) {
  const wallet = await requireUnlockedWallet(input.wallet)
  validateNetwork(input.network)
  validateAmount(input.amount)

  const networkConfig = getNetworkConfig(input.network)
  const sendData = await daemonClient.send(input.network, input.index, input.to, input.amount, input.token, wallet)
  const amountBigInt = BigInt(input.amount)
  const { formatted: amountFormatted } = formatTokenAmount(amountBigInt, input.amount, input.network, input.token)

  return {
    network: input.network,
    txHash: sendData.txHash,
    from: sendData.from,
    to: sendData.to,
    amount: input.amount,
    amountFormatted,
    fee: sendData.fee,
    feeFormatted: sendData.fee
      ? formatAmount(BigInt(sendData.fee), networkConfig.decimals, networkConfig.nativeSymbol)
      : undefined
  }
}
