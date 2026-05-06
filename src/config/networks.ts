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

import type { NetworkConfig, NetworkName, WdkConfigFile } from '../types/index.js'
import { configService } from '../services/config-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import walletsFileRaw from '../../wdk.config.json' with { type: 'json' }

const walletsFile = walletsFileRaw as WdkConfigFile

export function parseModuleName(moduleSpec: string): { name: string; version?: string } {
  const idx = moduleSpec.startsWith('@') ? moduleSpec.indexOf('@', 1) : moduleSpec.indexOf('@')
  if (idx > 0) {
    return { name: moduleSpec.slice(0, idx), version: moduleSpec.slice(idx + 1) }
  }
  return { name: moduleSpec }
}

const NETWORKS: Record<string, NetworkConfig> = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  NETWORKS[name] = {
    name,
    displayName: entry.displayName,
    type: parseModuleName(entry.module).name,
    module: entry.module,
    nativeSymbol: entry.nativeSymbol,
    decimals: entry.decimals,
    testnet: entry.testnet ?? false,
  }
}

export { NETWORKS }

export const NETWORK_NAMES = Object.keys(NETWORKS)

export function getCustomNetworks(): Record<string, NetworkConfig> {
  const custom = configService.get<Record<string, NetworkConfig>>('customNetworks')
  if (!custom || typeof custom !== 'object') return {}
  const result: Record<string, NetworkConfig> = {}
  for (const [name, config] of Object.entries(custom)) {
    result[name] = { ...config, custom: true }
  }
  return result
}

export function getAllNetworks(): Record<string, NetworkConfig> {
  return { ...NETWORKS, ...getCustomNetworks() }
}

export function getAllNetworkNames(): string[] {
  return Object.keys(getAllNetworks())
}

export function isBuiltinNetwork(name: string): boolean {
  return name in NETWORKS
}

export function getNetworkConfig(name: string): NetworkConfig {
  const all = getAllNetworks()
  const config = all[name]
  if (!config) throw new WdkCliError(`Network '${name}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  return config
}

export function isValidNetwork(name: string): boolean {
  return name in NETWORKS || name in getCustomNetworks()
}

export function isTestnet(name: string): boolean {
  try {
    const config = getNetworkConfig(name)
    return config?.testnet === true
  } catch {
    return false
  }
}

export function isCustomNetwork(name: string): boolean {
  return name in getCustomNetworks()
}

export function saveCustomNetwork(name: string, config: NetworkConfig): void {
  configService.set(`customNetworks.${name}`, config)
}

export function deleteCustomNetwork(name: string): void {
  configService.delete(`customNetworks.${name}`)
}

export function validateNetwork(network: string): asserts network is NetworkName {
  if (!isValidNetwork(network)) {
    throw new WdkCliError(`Network '${network}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  }
}
