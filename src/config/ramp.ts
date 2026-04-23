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

type ModuleAssets = Record<string, string>

const SUPPORTED_MODULES = ['moonpay'] as const
export type RampModule = typeof SUPPORTED_MODULES[number]

const moduleConfigs: Record<string, Record<string, ModuleAssets>> = {}

for (const [name, entry] of Object.entries(walletsFile.networks)) {
  const net = entry as Record<string, unknown>
  const modules: Record<string, ModuleAssets> = {}
  if (net.moonpay) modules.moonpay = net.moonpay as ModuleAssets
  if (Object.keys(modules).length > 0) {
    moduleConfigs[name] = modules
  }
}

export function getModuleAssets(network: string, module: string): ModuleAssets | undefined {
  return moduleConfigs[network]?.[module]
}

export function validateModule(module: string): RampModule {
  if (!SUPPORTED_MODULES.includes(module as RampModule)) {
    throw new WdkCliError(`Unsupported module '${module}'. Available: ${SUPPORTED_MODULES.join(', ')}`, ErrorCode.UNSUPPORTED_MODULE)
  }
  return module as RampModule
}

export function resolveAsset(network: string, token: string, module: RampModule): { code: string; token: string } {
  const assets = getModuleAssets(network, module)
  if (!assets) {
    throw new WdkCliError(`Network '${network}' does not support ${module}.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  }
  const asset = assets[token.toLowerCase()]
  if (!asset) {
    const supported = Object.keys(assets).join(', ')
    throw new WdkCliError(`Token '${token}' on '${network}' is not supported by ${module}. Supported: ${supported}`, ErrorCode.TOKEN_NOT_SUPPORTED)
  }
  return { code: asset, token: token.toLowerCase() }
}
