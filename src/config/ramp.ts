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

import walletsFile from '../../wdk.config.json' with { type: 'json' }
import { WdkCliError, ErrorCode } from '../errors/index.js'

// MoonPay encodes network in its asset code (e.g. usdt_arbitrum), so per-
// network config is a flat token-alias → asset-code map.
type MoonPayAssets = Record<string, string>

const SUPPORTED_MODULES = ['moonpay'] as const
export type RampModule = typeof SUPPORTED_MODULES[number]

const moonpayConfigs: Record<string, MoonPayAssets> = {}

for (const [name, entry] of Object.entries(walletsFile.networks)) {
  const ramp = (entry as Record<string, unknown>).ramp as
    | { moonpay?: MoonPayAssets }
    | undefined
  if (ramp?.moonpay) moonpayConfigs[name] = ramp.moonpay
}

export function validateModule(module: string): RampModule {
  if (!SUPPORTED_MODULES.includes(module as RampModule)) {
    throw new WdkCliError(`Unsupported module '${module}'. Available: ${SUPPORTED_MODULES.join(', ')}`, ErrorCode.UNSUPPORTED_MODULE)
  }
  return module as RampModule
}

export interface ResolvedAsset {
  code: string
  token: string
}

export function resolveAsset(network: string, token: string, module: RampModule): ResolvedAsset {
  const lower = token.toLowerCase()
  if (module === 'moonpay') {
    const assets = moonpayConfigs[network]
    if (!assets) {
      throw new WdkCliError(`Network '${network}' does not support moonpay.`, ErrorCode.NETWORK_NOT_SUPPORTED)
    }
    const code = assets[lower]
    if (!code) {
      const supported = Object.keys(assets).join(', ')
      throw new WdkCliError(`Token '${token}' on '${network}' is not supported by moonpay. Supported: ${supported}`, ErrorCode.TOKEN_NOT_SUPPORTED)
    }
    return { code, token: lower }
  }
  throw new WdkCliError(`Unsupported ramp module '${module as string}'.`, ErrorCode.UNSUPPORTED_MODULE)
}
