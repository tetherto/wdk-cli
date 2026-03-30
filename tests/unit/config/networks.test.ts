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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORKS, NETWORK_NAMES, isValidNetwork, isTestnet, getNetworkConfig, getAllNetworks, getAllNetworkNames, isCustomNetwork, isBuiltinNetwork, getCustomNetworks, saveCustomNetwork, deleteCustomNetwork } from '../../../src/config/networks.js'
import { configService } from '../../../src/services/config-service.js'

describe('networks', () => {
  it('validates network names', () => {
    expect(isValidNetwork('ethereum')).toBe(true)
    expect(isValidNetwork('bitcoin')).toBe(true)
    expect(isValidNetwork('solana')).toBe(true)
    expect(isValidNetwork('solana-devnet')).toBe(true)
    expect(isValidNetwork('unknown-network')).toBe(false)
    expect(isValidNetwork('')).toBe(false)
  })

  it('identifies testnets', () => {
    expect(isTestnet('bitcoin-testnet3')).toBe(true)
    expect(isTestnet('sepolia')).toBe(true)
    expect(isTestnet('solana-testnet')).toBe(true)
    expect(isTestnet('solana-devnet')).toBe(true)
    expect(isTestnet('spark-regtest')).toBe(true)
    expect(isTestnet('smart-account-sepolia')).toBe(true)
    expect(isTestnet('bitcoin')).toBe(false)
    expect(isTestnet('ethereum')).toBe(false)
    expect(isTestnet('solana')).toBe(false)
    expect(isTestnet('spark')).toBe(false)
    expect(isTestnet('smart-account-ethereum')).toBe(false)
  })

  it('all built-in networks have required fields', () => {
    for (const network of NETWORK_NAMES) {
      const config = NETWORKS[network]
      expect(config.name).toBe(network)
      expect(config.displayName).toBeTruthy()
      expect(config.module).toMatch(/^@tetherto\/wdk-wallet-(evm|btc|solana|spark|evm-erc-4337|tron)$/)
      expect(config.nativeSymbol).toBeTruthy()
      expect(config.decimals).toBeGreaterThan(0)
    }
  })

  it('identifies built-in networks', () => {
    expect(isBuiltinNetwork('ethereum')).toBe(true)
    expect(isBuiltinNetwork('bitcoin')).toBe(true)
    expect(isBuiltinNetwork('nonexistent')).toBe(false)
  })
})

describe('custom networks', () => {
  const mockCustomNetwork = {
    name: 'optimism',
    displayName: 'Optimism',
    type: '@tetherto/wdk-wallet-evm',
    module: '@tetherto/wdk-wallet-evm',
    nativeSymbol: 'ETH',
    decimals: 18,
    custom: true,
    testnet: false,
  }

  beforeEach(() => {
    vi.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'customNetworks') {
        return { optimism: mockCustomNetwork }
      }
      return undefined
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns custom networks from config', () => {
    const custom = getCustomNetworks()
    expect(custom).toHaveProperty('optimism')
    expect(custom.optimism.displayName).toBe('Optimism')
    expect(custom.optimism.custom).toBe(true)
  })

  it('getAllNetworks merges built-in and custom', () => {
    const all = getAllNetworks()
    expect(all).toHaveProperty('ethereum')
    expect(all).toHaveProperty('optimism')
  })

  it('getAllNetworkNames includes custom networks', () => {
    const names = getAllNetworkNames()
    expect(names).toContain('ethereum')
    expect(names).toContain('optimism')
  })

  it('isValidNetwork accepts custom networks', () => {
    expect(isValidNetwork('optimism')).toBe(true)
    expect(isValidNetwork('nonexistent')).toBe(false)
  })

  it('isCustomNetwork identifies custom networks', () => {
    expect(isCustomNetwork('optimism')).toBe(true)
    expect(isCustomNetwork('ethereum')).toBe(false)
  })

  it('getNetworkConfig returns custom network config', () => {
    const config = getNetworkConfig('optimism')
    expect(config.displayName).toBe('Optimism')
    expect(config.module).toBe('@tetherto/wdk-wallet-evm')
    expect(config.custom).toBe(true)
  })

  it('isTestnet works with custom networks', () => {
    expect(isTestnet('optimism')).toBe(false)

    vi.restoreAllMocks()
    vi.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'customNetworks') {
        return { 'optimism-testnet': { ...mockCustomNetwork, name: 'optimism-testnet', testnet: true } }
      }
      return undefined
    })

    expect(isTestnet('optimism-testnet')).toBe(true)
  })

  it('saveCustomNetwork stores to config', () => {
    const setSpy = vi.spyOn(configService, 'set').mockImplementation(() => {})
    saveCustomNetwork('linea', mockCustomNetwork)
    expect(setSpy).toHaveBeenCalledWith('customNetworks.linea', mockCustomNetwork)
  })

  it('deleteCustomNetwork removes from config', () => {
    const deleteSpy = vi.spyOn(configService, 'delete').mockImplementation(() => {})
    deleteCustomNetwork('optimism')
    expect(deleteSpy).toHaveBeenCalledWith('customNetworks.optimism')
  })

  it('returns empty object when no custom networks exist', () => {
    vi.restoreAllMocks()
    vi.spyOn(configService, 'get').mockReturnValue(undefined)
    const custom = getCustomNetworks()
    expect(custom).toEqual({})
  })

})
