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

import type { NetworkConfig } from '../types/index.js'
import { configService } from '../services/config-service.js'
import walletsFile from '../../wdk.config.json' with { type: 'json' }

const NETWORKS: Record<string, NetworkConfig> = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  const net = entry as Record<string, unknown>
  NETWORKS[name] = {
    name,
    displayName: net.displayName as string,
    type: net.module as string,
    module: net.module as string,
    nativeSymbol: net.nativeSymbol as string,
    decimals: net.decimals as number,
    testnet: (net.testnet as boolean) ?? false,
  }
}

export { NETWORKS }

export const NETWORK_NAMES = Object.keys(NETWORKS)

export function getCustomNetworks(): Record<string, NetworkConfig> {
  const custom = configService.get('customNetworks') as Record<string, NetworkConfig> | undefined
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
  if (!config) throw new Error(`Network '${name}' is not supported.`)
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
