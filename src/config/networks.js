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

import { configService } from '../services/config-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import walletsFile from '../../wdk.config.json' with { type: 'json' }

export function parseModuleName(moduleSpec) {
  const idx = moduleSpec.startsWith('@') ? moduleSpec.indexOf('@', 1) : moduleSpec.indexOf('@')
  if (idx > 0) {
    return { name: moduleSpec.slice(0, idx), version: moduleSpec.slice(idx + 1) }
  }
  return { name: moduleSpec }
}

const NETWORKS = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  NETWORKS[name] = {
    name,
    displayName: entry.displayName,
    type: parseModuleName(entry.module).name,
    module: entry.module,
    nativeSymbol: entry.nativeSymbol,
    decimals: entry.decimals,
    testnet: entry.testnet ?? false
  }
}

export { NETWORKS }

export const NETWORK_NAMES = Object.keys(NETWORKS)

export function getCustomNetworks() {
  const custom = configService.get('customNetworks')
  if (!custom || typeof custom !== 'object') return {}
  const result = {}
  for (const [name, config] of Object.entries(custom)) {
    result[name] = { ...config, custom: true }
  }
  return result
}

export function getAllNetworks() {
  return { ...NETWORKS, ...getCustomNetworks() }
}

export function getAllNetworkNames() {
  return Object.keys(getAllNetworks())
}

export function isBuiltinNetwork(name) {
  return name in NETWORKS
}

export function getNetworkConfig(name) {
  const all = getAllNetworks()
  const config = all[name]
  if (!config) throw new WdkCliError(`Network '${name}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  return config
}

export function isValidNetwork(name) {
  return name in NETWORKS || name in getCustomNetworks()
}

export function isTestnet(name) {
  try {
    const config = getNetworkConfig(name)
    return config?.testnet === true
  } catch {
    return false
  }
}

export function isCustomNetwork(name) {
  return name in getCustomNetworks()
}

export function saveCustomNetwork(name, config) {
  configService.set(`customNetworks.${name}`, config)
}

export function deleteCustomNetwork(name) {
  configService.delete(`customNetworks.${name}`)
}

export function validateNetwork(network) {
  if (!isValidNetwork(network)) {
    throw new WdkCliError(`Network '${network}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  }
}
