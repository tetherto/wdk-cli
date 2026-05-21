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

import MoonPayProtocol from '@tetherto/wdk-protocol-fiat-moonpay'
import { WdkCliError, ErrorCode } from '../../errors/index.js'
import { resolveAsset } from '../../config/ramp.js'
import { isTestnet } from '../../config/networks.js'
import { configService } from '../config-service.js'
import type {
  RampProvider, RampInput, ResolvedAssets, QuoteResult, UrlResult, Direction,
} from './types.js'

interface MoonPayConfig {
  apiKey: string
  signUrl: string
  environment: 'production' | 'sandbox'
}

function loadConfig(): MoonPayConfig {
  const missing: string[] = []
  const apiKey = configService.get<string>('ramp.moonpay.apiKey') ?? ''
  if (!apiKey) missing.push('ramp.moonpay.apiKey')
  const signUrl = configService.get<string>('ramp.moonpay.signUrl') ?? ''
  if (!signUrl) missing.push('ramp.moonpay.signUrl')
  const env = configService.get<string>('ramp.moonpay.environment') ?? ''
  if (!env) missing.push('ramp.moonpay.environment')

  if (missing.length > 0) {
    const commands = missing.map(k => `  wdk config set ${k} <value>`).join('\n')
    throw new WdkCliError(
      `MoonPay not configured. Missing: ${missing.join(', ')}`,
      ErrorCode.MISSING_CONFIG,
      `Set required config:\n${commands}`,
    )
  }
  if (env !== 'production' && env !== 'sandbox') {
    throw new WdkCliError(`Invalid ramp.moonpay.environment '${env}'. Must be 'production' or 'sandbox'.`, ErrorCode.INVALID_CONFIG)
  }
  return { apiKey, signUrl, environment: env }
}

async function postToSignServer(url: string, endpoint: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlForSignature: url }),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new WdkCliError(
      `Cannot reach MoonPay sign server at '${endpoint}': ${detail}`,
      ErrorCode.SIGN_FAILED,
      'Check that ramp.moonpay.signUrl is correct and the server is reachable.',
    )
  }
  if (!response.ok) {
    throw new WdkCliError(`Failed to sign MoonPay URL: ${response.status} ${response.statusText}`, ErrorCode.SIGN_FAILED)
  }
  const data = await response.json() as Record<string, unknown>
  if (typeof data.signedUrl !== 'string' || !data.signedUrl) {
    throw new WdkCliError('Sign server returned invalid response: missing signedUrl', ErrorCode.SIGN_FAILED)
  }
  return data.signedUrl
}

export class MoonPayRampProvider implements RampProvider {
  readonly name = 'moonpay' as const
  private protocol?: MoonPayProtocol
  private environment?: 'production' | 'sandbox'

  private getProtocol(): MoonPayProtocol {
    if (!this.protocol) {
      const config = loadConfig()
      this.environment = config.environment
      this.protocol = new MoonPayProtocol(undefined, {
        apiKey: config.apiKey,
        environment: config.environment,
        signUrl: (url: string) => postToSignServer(url, config.signUrl),
      })
    }
    return this.protocol
  }

  validateEnvironment(network: string): void {
    this.getProtocol()
    if (this.environment === 'production' && isTestnet(network)) {
      throw new WdkCliError(
        `Cannot use production MoonPay with testnet '${network}'.`,
        ErrorCode.ENVIRONMENT_MISMATCH,
      )
    }
    if (this.environment === 'sandbox' && !isTestnet(network)) {
      throw new WdkCliError(
        `Cannot use sandbox MoonPay with mainnet '${network}'.`,
        ErrorCode.ENVIRONMENT_MISMATCH,
      )
    }
  }

  async resolveAssets(network: string, token: string, fiatCurrency: string): Promise<ResolvedAssets> {
    const protocol = this.getProtocol()
    const { code: cryptoCode } = resolveAsset(network, token, 'moonpay')
    const [cryptos, fiats] = await Promise.all([
      protocol.getSupportedCryptoAssets(),
      protocol.getSupportedFiatCurrencies(),
    ])
    const cryptoInfo = cryptos.find((a) => a.code === cryptoCode)
    if (!cryptoInfo) throw new WdkCliError(`Crypto asset '${cryptoCode}' is not supported by MoonPay.`, ErrorCode.TOKEN_NOT_SUPPORTED)
    const fiatInfo = fiats.find((f) => f.code === fiatCurrency)
    if (!fiatInfo) throw new WdkCliError(`Fiat currency '${fiatCurrency}' is not supported by MoonPay.`, ErrorCode.INVALID_ARGUMENT)
    return { cryptoCode, cryptoDecimals: cryptoInfo.decimals, fiatDecimals: fiatInfo.decimals }
  }

  async quote(input: RampInput, direction: Direction): Promise<QuoteResult | undefined> {
    const protocol = this.getProtocol()
    const { code: cryptoAsset } = resolveAsset(input.network, input.token, 'moonpay')
    try {
      if (direction === 'buy') {
        const spread = this.amountSpread(input)
        const q = await protocol.quoteBuy({ cryptoAsset, fiatCurrency: input.fiatCurrency, ...spread })
        return { fiatAmount: q.fiatAmount, cryptoAmount: q.cryptoAmount, fee: q.fee, rate: q.rate }
      }
      // Sell quotes require cryptoAmount on the MoonPay side.
      if (input.cryptoAmount === undefined) return undefined
      const q = await protocol.quoteSell({ cryptoAsset, fiatCurrency: input.fiatCurrency, cryptoAmount: input.cryptoAmount })
      return { fiatAmount: q.fiatAmount, cryptoAmount: q.cryptoAmount, fee: q.fee, rate: q.rate }
    } catch {
      return undefined
    }
  }

  async buildUrl(input: RampInput, direction: Direction): Promise<UrlResult> {
    const protocol = this.getProtocol()
    const { code: cryptoAsset } = resolveAsset(input.network, input.token, 'moonpay')
    const spread = this.amountSpread(input)
    if (direction === 'buy') {
      const { buyUrl } = await protocol.buy({
        cryptoAsset, fiatCurrency: input.fiatCurrency, recipient: input.walletAddress, ...spread,
      })
      return { url: buyUrl }
    }
    const { sellUrl } = await protocol.sell({
      cryptoAsset, fiatCurrency: input.fiatCurrency, refundAddress: input.walletAddress, ...spread,
    })
    return { url: sellUrl }
  }

  private amountSpread(input: RampInput): { fiatAmount: bigint } | { cryptoAmount: bigint } {
    if (input.fiatAmount !== undefined) return { fiatAmount: input.fiatAmount }
    if (input.cryptoAmount !== undefined) return { cryptoAmount: input.cryptoAmount }
    throw new WdkCliError('Must specify either fiatAmount or cryptoAmount.', ErrorCode.INVALID_ARGUMENT)
  }
}
