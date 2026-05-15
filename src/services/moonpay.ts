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
import { isTestnet } from '../config/networks.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { configService } from './config-service.js'

export interface MoonPayConfig {
  apiKey: string
  signUrl: string
  environment: 'production' | 'sandbox'
}

export function getMoonPayConfig(): MoonPayConfig {
  const missing: string[] = []

  const apiKey = configService.get<string>('moonpay.apiKey') ?? ''
  if (!apiKey) missing.push('moonpay.apiKey')

  const signUrl = configService.get<string>('moonpay.signUrl') ?? ''
  if (!signUrl) missing.push('moonpay.signUrl')

  const env = configService.get<string>('moonpay.environment') ?? ''
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

  return { apiKey, signUrl, environment: env }
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

export function createMoonPayProtocol(config: MoonPayConfig): MoonPayProtocol {
  return new MoonPayProtocol(undefined, {
    apiKey: config.apiKey,
    environment: config.environment,
    signUrl: (url: string) => postToSignServer(url, config.signUrl),
  })
}
