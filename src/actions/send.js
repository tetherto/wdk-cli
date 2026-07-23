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
import { validateRecipient } from '../services/address-service.js'
import { convertToUsd } from '../services/price-service.js'
import { formatAmount, formatTokenAmount } from '../ui/formatters.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/**
 * @typedef {Object} SendInput
 * @property {string} network - The blockchain network name.
 * @property {number} index - The BIP-44 account index.
 * @property {string} to - Recipient address.
 * @property {string} amount - Amount in base units (wei/satoshis/lamports) as a decimal string.
 * @property {string} [token] - Token contract address (ERC-20, SPL, TRC-20); omit for native.
 * @property {string} [wallet] - The wallet name (defaults to the active wallet).
 */

/**
 * @typedef {Object} SendPreview
 * @property {string} network - The blockchain network name.
 * @property {string} networkName - Human-readable network display name.
 * @property {string} to - Recipient address.
 * @property {string} amount - Amount in base units.
 * @property {string} amountFormatted - Human-readable formatted amount with symbol.
 * @property {number} [amountUsd] - Approximate USD value of the amount.
 * @property {string} [token] - Token contract address, if a token was specified.
 * @property {string} [tokenSymbol] - Token symbol.
 * @property {string} estimatedFee - Estimated fee in base units.
 * @property {string} estimatedFeeFormatted - Human-readable formatted estimated fee.
 * @property {number} [estimatedFeeUsd] - Approximate USD value of the estimated fee.
 */

/**
 * @typedef {Object} SendResult
 * @property {string} network - The blockchain network name.
 * @property {string} txHash - On-chain transaction hash.
 * @property {string} from - Sender address.
 * @property {string} to - Recipient address.
 * @property {string} amount - Amount sent in base units.
 * @property {string} amountFormatted - Human-readable formatted amount with symbol.
 * @property {string} [fee] - Actual fee paid in base units.
 * @property {string} [feeFormatted] - Human-readable formatted fee with native symbol.
 */

/**
 * Validates that the amount string is a positive integer (no decimals).
 *
 * @param {string} amount - The amount string to validate.
 * @returns {void}
 */
function validateAmount (amount) {
  if (!/^\d+$/.test(amount) || amount === '0') {
    throw new WdkCliError(
      'Invalid amount. Must be a positive integer in base units (wei/satoshis/lamports).',
      ErrorCode.INVALID_AMOUNT,
      'Do not use decimal points. Example: 1000000 for 1 USDT (6 decimals).'
    )
  }
}

/**
 * Estimates the fee and returns a preview of a send transaction without broadcasting.
 *
 * @param {SendInput} input - The send parameters.
 * @returns {Promise<SendPreview>} The transaction preview including estimated fee.
 */
export async function previewSend (input) {
  const wallet = await daemonClient.requireUnlocked(input.wallet)
  validateNetwork(input.network)
  validateRecipient(input.network, input.to)
  validateAmount(input.amount)

  const feeQuote = await daemonClient.estimateFee(
    input.network,
    input.index,
    input.to,
    input.amount,
    input.token,
    wallet
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
  try {
    amountUsd = await convertToUsd(input.network, amountBigInt, input.token)
  } catch {
    /* no price */
  }
  try {
    estimatedFeeUsd = await convertToUsd(input.network, BigInt(feeQuote.fee))
  } catch {
    /* no price */
  }

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

/**
 * Broadcasts a send transaction and returns the result.
 *
 * @param {SendInput} input - The send parameters.
 * @returns {Promise<SendResult>} The transaction result including the tx hash.
 */
export async function executeSend (input) {
  const wallet = await daemonClient.requireUnlocked(input.wallet)
  validateNetwork(input.network)
  validateRecipient(input.network, input.to)
  validateAmount(input.amount)

  const networkConfig = getNetworkConfig(input.network)
  const sendData = await daemonClient.send(
    input.network,
    input.index,
    input.to,
    input.amount,
    input.token,
    wallet
  )
  const amountBigInt = BigInt(input.amount)
  const { formatted: amountFormatted } = formatTokenAmount(
    amountBigInt,
    input.amount,
    input.network,
    input.token
  )

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
