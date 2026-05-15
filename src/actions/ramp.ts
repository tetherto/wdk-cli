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

import type MoonPayProtocol from '@tetherto/wdk-protocol-fiat-moonpay'
import { daemonClient } from '../daemon/client.js'
import { validateNetwork } from '../config/networks.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { validateModule, resolveAsset } from '../config/ramp.js'
import { getMoonPayConfig, validateEnvironment, createMoonPayProtocol } from '../services/moonpay.js'
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

async function getCryptoDecimals(protocol: MoonPayProtocol, code: string): Promise<number> {
  const assets = await protocol.getSupportedCryptoAssets()
  const info = assets.find((a) => a.code === code)
  if (!info) throw new WdkCliError(`Crypto asset '${code}' is not supported by MoonPay.`, ErrorCode.TOKEN_NOT_SUPPORTED)
  return info.decimals
}

async function getFiatDecimals(protocol: MoonPayProtocol, code: string): Promise<number> {
  const fiats = await protocol.getSupportedFiatCurrencies()
  const info = fiats.find((f) => f.code === code)
  if (!info) throw new WdkCliError(`Fiat currency '${code}' is not supported by MoonPay.`, ErrorCode.INVALID_ARGUMENT)
  return info.decimals
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
  const { code: cryptoAsset, token: resolvedToken } = resolveAsset(input.network, input.token, module)
  const fiatCurrency = input.fiatCurrency ?? 'usd'

  if (module !== 'moonpay') {
    throw new WdkCliError(`Module '${module}' is not implemented.`, ErrorCode.INVALID_ARGUMENT)
  }

  const config = getMoonPayConfig()
  validateEnvironment(input.network, config.environment)
  const address = await daemonClient.getAddress(input.network, input.index, wallet)
  const protocol = createMoonPayProtocol(config)

  const [cryptoDecimals, fiatDecimals] = await Promise.all([
    getCryptoDecimals(protocol, cryptoAsset),
    getFiatDecimals(protocol, fiatCurrency),
  ])

  const fiatAmount = input.fiatAmount ? toBaseUnits(input.fiatAmount, fiatDecimals, 'fiatAmount') : undefined
  const cryptoAmount = input.cryptoAmount ? toBaseUnits(input.cryptoAmount, cryptoDecimals, 'cryptoAmount') : undefined
  const amountSpread = fiatAmount !== undefined ? { fiatAmount } : { cryptoAmount: cryptoAmount! }

  const isBuy = input.direction === 'buy'
  const fiatSymbol = fiatCurrency.toUpperCase()
  const tokenSymbol = resolvedToken.toUpperCase()

  let quote: { cryptoAmount: bigint; fiatAmount: bigint; fee: bigint; rate: string; metadata?: unknown } | undefined
  try {
    if (isBuy) {
      quote = await protocol.quoteBuy({ cryptoAsset, fiatCurrency, ...amountSpread })
    } else if (cryptoAmount !== undefined) {
      quote = await protocol.quoteSell({ cryptoAsset, fiatCurrency, cryptoAmount })
    }
  } catch {
    // Quote is best-effort; the widget URL is still useful without it.
  }

  const url = isBuy
    ? (await protocol.buy({ cryptoAsset, fiatCurrency, recipient: address, ...amountSpread })).buyUrl
    : (await protocol.sell({ cryptoAsset, fiatCurrency, refundAddress: address, ...amountSpread })).sellUrl

  const fiat = (amount: bigint) => formatAmount(amount, fiatDecimals, fiatSymbol)
  const crypto = (amount: bigint) => formatAmount(amount, cryptoDecimals, tokenSymbol)

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
    token: resolvedToken,
    module,
    fiatCurrency,
    payAmount,
    receiveAmount,
    fee: quote ? formatAmount(quote.fee, fiatDecimals, fiatSymbol) : undefined,
    rate: quote?.rate,
    url,
  }
}
