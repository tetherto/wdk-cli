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
import { validateModule, resolveAsset } from '../config/ramp.js'
import { getMoonPayConfig, validateEnvironment, signMoonPayUrl, buildMoonPayUrl } from '../services/moonpay.js'
import { requireUnlockedWallet } from '../utils/wallet.js'

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
  fiatAmount?: string
  cryptoAmount?: string
  url: string
}

export async function createRampUrl(input: CreateRampUrlInput): Promise<RampResult> {
  if (input.fiatAmount && input.cryptoAmount) {
    throw new WdkCliError('Cannot specify both fiatAmount and cryptoAmount.', ErrorCode.INVALID_ARGUMENT)
  }
  const wallet = await requireUnlockedWallet(input.wallet)
  validateNetwork(input.network)
  const module = validateModule(input.module ?? 'moonpay')
  const { code: cryptoAsset, token: resolvedToken } = resolveAsset(input.network, input.token, module)
  const fiatCurrency = input.fiatCurrency ?? 'usd'

  if (module === 'moonpay') {
    const config = getMoonPayConfig()
    validateEnvironment(input.network, config.environment)
    const address = await daemonClient.getAddress(input.network, input.index, wallet)
    let url = buildMoonPayUrl(input.direction, config, cryptoAsset, address, fiatCurrency, input.fiatAmount, input.cryptoAmount)
    url = await signMoonPayUrl(url, config.signUrl)
    return {
      direction: input.direction,
      network: input.network,
      address,
      token: resolvedToken,
      module,
      fiatCurrency,
      fiatAmount: input.fiatAmount,
      cryptoAmount: input.cryptoAmount,
      url,
    }
  }

  throw new WdkCliError(`Module '${module}' is not implemented.`, ErrorCode.INVALID_ARGUMENT)
}
