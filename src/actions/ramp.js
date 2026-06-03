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
import { validateNetwork } from '../config/networks.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { validateModule } from '../config/ramp.js'
import { getRampProvider } from '../services/ramp/index.js'
import { formatAmount } from '../ui/formatters.js'
import { humanToBaseUnits } from '../ui/parsers.js'

/**
 * @typedef {Object} CreateRampUrlInput
 * @property {'buy' | 'sell'} direction - Whether to buy or sell crypto.
 * @property {string} network - The blockchain network name.
 * @property {number} index - The BIP-44 account index.
 * @property {string} token - Crypto asset code (e.g. "usdt", "eth", "btc").
 * @property {string} [module] - Fiat provider module name (default: "moonpay").
 * @property {string} [fiatCurrency] - Fiat currency code (default: "usd").
 * @property {string} [fiatAmount] - Human-readable fiat amount (e.g. "100"); mutually exclusive with cryptoAmount.
 * @property {string} [cryptoAmount] - Human-readable crypto amount (e.g. "0.05"); mutually exclusive with fiatAmount.
 * @property {string} [wallet] - The wallet name (defaults to the active wallet).
 */

/**
 * @typedef {Object} RampResult
 * @property {'buy' | 'sell'} direction - The ramp direction.
 * @property {string} network - The blockchain network name.
 * @property {string} address - The wallet address used for the transaction.
 * @property {string} token - Lowercased token code.
 * @property {string} module - The fiat provider module name.
 * @property {string} fiatCurrency - Lowercased fiat currency code.
 * @property {string} payAmount - Formatted amount the user will pay.
 * @property {string} [receiveAmount] - Formatted amount the user will receive (when quote available).
 * @property {string} [fee] - Formatted provider fee (when quote available).
 * @property {string} [rate] - Exchange rate string (when quote available).
 * @property {string} url - The provider URL to open in a browser.
 */

/**
 * Builds a fiat on-ramp or off-ramp URL for the given network and token.
 *
 * @param {CreateRampUrlInput} input - The ramp URL parameters.
 * @returns {Promise<RampResult>} The ramp result including the provider URL.
 */
export async function createRampUrl (input) {
  if (input.fiatAmount && input.cryptoAmount) {
    throw new WdkCliError(
      'Cannot specify both fiatAmount and cryptoAmount.',
      ErrorCode.INVALID_ARGUMENT
    )
  }
  if (!input.fiatAmount && !input.cryptoAmount) {
    throw new WdkCliError(
      'Must specify either fiatAmount or cryptoAmount.',
      ErrorCode.INVALID_ARGUMENT
    )
  }
  const wallet = await daemonClient.requireUnlocked(input.wallet)
  validateNetwork(input.network)
  const module = validateModule(input.module ?? 'moonpay')
  const fiatCurrency = input.fiatCurrency ?? 'usd'

  const provider = getRampProvider(module)
  provider.validateEnvironment(input.network)

  const address = await daemonClient.getAddress(input.network, input.index, wallet)
  const assets = await provider.resolveAssets(input.network, input.token, fiatCurrency)

  const fiatAmount = input.fiatAmount
    ? BigInt(humanToBaseUnits(input.fiatAmount, assets.fiatDecimals, 'fiatAmount'))
    : undefined
  const cryptoAmount = input.cryptoAmount
    ? BigInt(humanToBaseUnits(input.cryptoAmount, assets.cryptoDecimals, 'cryptoAmount'))
    : undefined

  const rampInput = {
    network: input.network,
    token: input.token.toLowerCase(),
    walletAddress: address,
    fiatCurrency,
    fiatAmount,
    cryptoAmount,
    fiatDecimals: assets.fiatDecimals,
    cryptoDecimals: assets.cryptoDecimals
  }

  const quote = await provider.quote(rampInput, input.direction)
  const urlResult = await provider.buildUrl(rampInput, input.direction)

  const isBuy = input.direction === 'buy'
  const fiatSymbol = fiatCurrency.toUpperCase()
  const tokenSymbol = input.token.toUpperCase()
  const fiat = (amount) => formatAmount(amount, assets.fiatDecimals, fiatSymbol)
  const crypto = (amount) => formatAmount(amount, assets.cryptoDecimals, tokenSymbol)

  let payAmount
  let receiveAmount
  if (quote) {
    payAmount = isBuy ? fiat(quote.fiatAmount) : crypto(quote.cryptoAmount)
    receiveAmount = isBuy ? crypto(quote.cryptoAmount) : fiat(quote.fiatAmount)
  } else {
    payAmount = fiatAmount !== undefined ? fiat(fiatAmount) : crypto(cryptoAmount)
  }

  return {
    direction: input.direction,
    network: input.network,
    address,
    token: input.token.toLowerCase(),
    module,
    fiatCurrency,
    payAmount,
    receiveAmount,
    fee: quote ? fiat(quote.fee) : undefined,
    rate: quote?.rate,
    url: urlResult.url
  }
}
