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

import { isTestnet } from '../config/networks.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { configService } from './config-service.js'

const BUY_ORIGINS = { production: 'https://buy.moonpay.com', sandbox: 'https://buy-sandbox.moonpay.com' }
const SELL_ORIGINS = { production: 'https://sell.moonpay.com', sandbox: 'https://sell-sandbox.moonpay.com' }

export interface MoonPayConfig {
  apiKey: string
  signUrl: string
  environment: 'production' | 'sandbox'
}

export function getMoonPayConfig(): MoonPayConfig {
  const missing: string[] = []

  const apiKey = configService.get('moonpay.apiKey') as string
  if (!apiKey) missing.push('moonpay.apiKey')

  const signUrl = configService.get('moonpay.signUrl') as string
  if (!signUrl) missing.push('moonpay.signUrl')

  const env = configService.get('moonpay.environment') as string
  if (!env) missing.push('moonpay.environment')

  if (missing.length > 0) {
    const commands = missing.map(k => `  wdk config set ${k} <value>`).join('\n')
    throw new WdkCliError(
      `MoonPay not configured. Missing: ${missing.join(', ')}`,
      ErrorCode.MISSING_CONFIG,
      `Set required config:\n${commands}`,
    )
  }

  if (env !== 'production' && env !== 'sandbox') {
    throw new WdkCliError(`Invalid moonpay.environment '${env}'. Must be 'production' or 'sandbox'.`, ErrorCode.INVALID_CONFIG)
  }

  return { apiKey, signUrl, environment: env as 'production' | 'sandbox' }
}

export function validateEnvironment(network: string, environment: 'production' | 'sandbox'): void {
  if (environment === 'production' && isTestnet(network)) {
    throw new WdkCliError(
      `Cannot use production MoonPay with testnet '${network}'.`,
      ErrorCode.ENVIRONMENT_MISMATCH,
    )
  }
  if (environment === 'sandbox' && !isTestnet(network)) {
    throw new WdkCliError(
      `Cannot use sandbox MoonPay with mainnet '${network}'.`,
      ErrorCode.ENVIRONMENT_MISMATCH,
    )
  }
}

export async function signMoonPayUrl(url: string, signEndpoint: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(signEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlForSignature: url }),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new WdkCliError(
      `Cannot reach MoonPay sign server at '${signEndpoint}': ${detail}`,
      ErrorCode.SIGN_FAILED,
      'Check that moonpay.signUrl is correct and the server is reachable.',
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

export function buildMoonPayUrl(
  direction: 'buy' | 'sell',
  config: Pick<MoonPayConfig, 'apiKey' | 'environment'>,
  cryptoAsset: string,
  address: string,
  fiat?: string,
  fiatAmount?: string,
  cryptoAmount?: string,
): string {
  const origins = direction === 'buy' ? BUY_ORIGINS : SELL_ORIGINS
  const url = new URL('/', origins[config.environment])
  url.searchParams.set('apiKey', config.apiKey)

  if (direction === 'buy') {
    url.searchParams.set('currencyCode', cryptoAsset)
    if (fiat) url.searchParams.set('baseCurrencyCode', fiat)
    url.searchParams.set('walletAddress', address)
    if (fiatAmount) url.searchParams.set('baseCurrencyAmount', fiatAmount)
    if (cryptoAmount) url.searchParams.set('quoteCurrencyAmount', cryptoAmount)
  } else {
    url.searchParams.set('baseCurrencyCode', cryptoAsset)
    if (fiat) url.searchParams.set('quoteCurrencyCode', fiat)
    url.searchParams.set('refundWalletAddress', address)
    if (fiatAmount) url.searchParams.set('quoteCurrencyAmount', fiatAmount)
    if (cryptoAmount) url.searchParams.set('baseCurrencyAmount', cryptoAmount)
  }

  return url.toString()
}
