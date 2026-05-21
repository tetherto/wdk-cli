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
import { requireUnlockedWallet } from '../utils/wallet.js'
import { formatAmount } from '../ui/formatters.js'

export interface CreateRampUrlInput {
  direction: 'buy' | 'sell'
  network: string
  index: number
  token: string
  module?: string
  fiatCurrency?: string
  fiatAmount?: string
  cryptoAmount?: string
  wallet?: string
}

export interface RampResult {
  direction: 'buy' | 'sell'
  network: string
  address: string
  token: string
  module: string
  fiatCurrency: string
  payAmount: string
  receiveAmount?: string
  fee?: string
  rate?: string
  url: string
}

function toBaseUnits(humanAmount: string, decimals: number, label: string): bigint {
  const match = humanAmount.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) {
    throw new WdkCliError(
      `Invalid ${label} '${humanAmount}'. Must be a non-negative number.`,
      ErrorCode.INVALID_AMOUNT,
    )
  }
  const fracPart = match[2] ?? ''
  if (fracPart.length > decimals) {
    throw new WdkCliError(
      `${label} '${humanAmount}' has more decimals (${fracPart.length}) than allowed (${decimals}).`,
      ErrorCode.INVALID_AMOUNT,
    )
  }
  const combined = match[1] + fracPart.padEnd(decimals, '0')
  return BigInt(combined.replace(/^0+(?=\d)/, '') || '0')
}

export async function createRampUrl(input: CreateRampUrlInput): Promise<RampResult> {
  if (input.fiatAmount && input.cryptoAmount) {
    throw new WdkCliError('Cannot specify both fiatAmount and cryptoAmount.', ErrorCode.INVALID_ARGUMENT)
  }
  if (!input.fiatAmount && !input.cryptoAmount) {
    throw new WdkCliError('Must specify either fiatAmount or cryptoAmount.', ErrorCode.INVALID_ARGUMENT)
  }
  const wallet = await requireUnlockedWallet(input.wallet)
  validateNetwork(input.network)
  const module = validateModule(input.module ?? 'moonpay')
  const fiatCurrency = input.fiatCurrency ?? 'usd'

  const provider = getRampProvider(module)
  provider.validateEnvironment(input.network)

  const address = await daemonClient.getAddress(input.network, input.index, wallet)
  const assets = await provider.resolveAssets(input.network, input.token, fiatCurrency)

  const fiatAmount = input.fiatAmount ? toBaseUnits(input.fiatAmount, assets.fiatDecimals, 'fiatAmount') : undefined
  const cryptoAmount = input.cryptoAmount ? toBaseUnits(input.cryptoAmount, assets.cryptoDecimals, 'cryptoAmount') : undefined

  const rampInput = {
    network: input.network,
    token: input.token.toLowerCase(),
    walletAddress: address,
    fiatCurrency,
    fiatAmount,
    cryptoAmount,
    fiatDecimals: assets.fiatDecimals,
    cryptoDecimals: assets.cryptoDecimals,
  }

  const quote = await provider.quote(rampInput, input.direction)
  const urlResult = await provider.buildUrl(rampInput, input.direction)

  const isBuy = input.direction === 'buy'
  const fiatSymbol = fiatCurrency.toUpperCase()
  const tokenSymbol = input.token.toUpperCase()
  const fiat = (amount: bigint) => formatAmount(amount, assets.fiatDecimals, fiatSymbol)
  const crypto = (amount: bigint) => formatAmount(amount, assets.cryptoDecimals, tokenSymbol)

  let payAmount: string
  let receiveAmount: string | undefined
  if (quote) {
    payAmount = isBuy ? fiat(quote.fiatAmount) : crypto(quote.cryptoAmount)
    receiveAmount = isBuy ? crypto(quote.cryptoAmount) : fiat(quote.fiatAmount)
  } else {
    payAmount = fiatAmount !== undefined ? fiat(fiatAmount) : crypto(cryptoAmount!)
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
    url: urlResult.url,
  }
}
