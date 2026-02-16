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

import type { NetworkName, NetworkConfig } from '../types/index.js'
import { configService } from '../services/config-service.js'

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  bitcoin: {
    name: 'bitcoin',
    displayName: 'Bitcoin',
    type: 'wdk-wallet-btc',
    nativeSymbol: 'BTC',
    decimals: 8,
  },
  'bitcoin-testnet3': {
    name: 'bitcoin-testnet3',
    displayName: 'Bitcoin Testnet3',
    type: 'wdk-wallet-btc',
    nativeSymbol: 'tBTC',
    decimals: 8,
  },
  'bitcoin-signet': {
    name: 'bitcoin-signet',
    displayName: 'Bitcoin Signet',
    type: 'wdk-wallet-btc',
    nativeSymbol: 'sBTC',
    decimals: 8,
  },
  ethereum: {
    name: 'ethereum',
    displayName: 'Ethereum',
    type: 'wdk-wallet-evm',
    nativeSymbol: 'ETH',
    decimals: 18,
  },
  sepolia: {
    name: 'sepolia',
    displayName: 'Sepolia Testnet',
    type: 'wdk-wallet-evm',
    nativeSymbol: 'ETH',
    decimals: 18,
  },
  polygon: {
    name: 'polygon',
    displayName: 'Polygon',
    type: 'wdk-wallet-evm',
    nativeSymbol: 'POL',
    decimals: 18,
  },
  arbitrum: {
    name: 'arbitrum',
    displayName: 'Arbitrum One',
    type: 'wdk-wallet-evm',
    nativeSymbol: 'ETH',
    decimals: 18,
  },
  bsc: {
    name: 'bsc',
    displayName: 'BNB Smart Chain',
    type: 'wdk-wallet-evm',
    nativeSymbol: 'BNB',
    decimals: 18,
  },
  avalanche: {
    name: 'avalanche',
    displayName: 'Avalanche C-Chain',
    type: 'wdk-wallet-evm',
    nativeSymbol: 'AVAX',
    decimals: 18,
  },
  solana: {
    name: 'solana',
    displayName: 'Solana',
    type: 'wdk-wallet-solana',
    nativeSymbol: 'SOL',
    decimals: 9,
  },
  'solana-testnet': {
    name: 'solana-testnet',
    displayName: 'Solana Testnet',
    type: 'wdk-wallet-solana',
    nativeSymbol: 'SOL',
    decimals: 9,
  },
  'solana-devnet': {
    name: 'solana-devnet',
    displayName: 'Solana Devnet',
    type: 'wdk-wallet-solana',
    nativeSymbol: 'SOL',
    decimals: 9,
  },
}

export const NETWORK_NAMES = Object.keys(NETWORKS) as NetworkName[]

const BUILTIN_TESTNETS: readonly string[] = ['bitcoin-testnet3', 'bitcoin-signet', 'sepolia', 'solana-testnet', 'solana-devnet']

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

export function isBuiltinNetwork(name: string): name is NetworkName {
  return name in NETWORKS
}

export function getNetworkConfig(name: string): NetworkConfig {
  const all = getAllNetworks()
  const config = all[name]
  if (!config) throw new Error(`Network '${name}' is not supported.`)
  return config
}

export function isEvmNetwork(name: string): boolean {
  const config = getNetworkConfig(name)
  return config?.type === 'wdk-wallet-evm'
}

export function isBtcNetwork(name: string): boolean {
  const config = getNetworkConfig(name)
  return config?.type === 'wdk-wallet-btc'
}

export function isSolanaNetwork(name: string): boolean {
  const config = getNetworkConfig(name)
  return config?.type === 'wdk-wallet-solana'
}

export function isValidNetwork(name: string): name is NetworkName {
  return name in NETWORKS || name in getCustomNetworks()
}

export function isTestnet(name: string): boolean {
  if (BUILTIN_TESTNETS.includes(name)) return true
  const config = getNetworkConfig(name)
  return config?.testnet === true
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
