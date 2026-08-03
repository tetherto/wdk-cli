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

import { jest } from '@jest/globals'
import {
  NETWORKS,
  NETWORK_NAMES,
  isValidNetwork,
  isTestnet,
  getNetworkConfig,
  getAllNetworks,
  getAllNetworkNames,
  isCustomNetwork,
  isBuiltinNetwork,
  getCustomNetworks,
  saveCustomNetwork,
  deleteCustomNetwork,
  getChainId
} from '../../../src/config/networks.js'
import { configService } from '../../../src/services/config-service.js'

const BUILT_IN_NETWORK_NAMES = [
  'bitcoin', 'bitcoin-testnet3', 'ethereum', 'sepolia', 'polygon', 'arbitrum',
  'base', 'bsc', 'avalanche', 'solana', 'solana-testnet', 'solana-devnet',
  'spark', 'spark-regtest', 'tron', 'tron-testnet', 'smart-account-ethereum',
  'smart-account-sepolia', 'smart-account-polygon', 'smart-account-arbitrum',
  'smart-account-base', 'smart-account-plasma'
]

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

  it('exposes the built-in network list', () => {
    expect(NETWORK_NAMES).toEqual(BUILT_IN_NETWORK_NAMES)
  })

  it('builds complete configs for built-in networks', () => {
    expect(NETWORKS.ethereum).toEqual({
      name: 'ethereum',
      displayName: 'Ethereum',
      type: '@tetherto/wdk-wallet-evm',
      module: '@tetherto/wdk-wallet-evm@1.0.0-beta.11',
      nativeSymbol: 'ETH',
      decimals: 18,
      testnet: false
    })
    expect(NETWORKS.bitcoin).toEqual({
      name: 'bitcoin',
      displayName: 'Bitcoin',
      type: '@tetherto/wdk-wallet-btc',
      module: '@tetherto/wdk-wallet-btc@1.0.0-beta.8',
      nativeSymbol: 'BTC',
      decimals: 8,
      testnet: false
    })
  })

  it('identifies built-in networks', () => {
    expect(isBuiltinNetwork('ethereum')).toBe(true)
    expect(isBuiltinNetwork('bitcoin')).toBe(true)
    expect(isBuiltinNetwork('nonexistent')).toBe(false)
  })
})

describe('getChainId', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns the chain id for built-in networks', () => {
    expect(getChainId('ethereum')).toBe('eip155:1')
    expect(getChainId('tron')).toBe('tron:mainnet')
    expect(getChainId('bitcoin')).toBe('bip122:000000000019d6689c085ae165831e93')
  })

  it('returns the configured chain id for custom networks', () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'customNetworks.linea.chainId' ? 'eip155:59144' : undefined
    )

    expect(getChainId('linea')).toBe('eip155:59144')
  })

  it('falls back to a synthetic id for networks without one', () => {
    jest.spyOn(configService, 'get').mockImplementation(() => undefined)

    expect(getChainId('mystery-net')).toBe('wdk:mystery-net')
  })
})

describe('custom networks', () => {
  const DUMMY_CUSTOM_NETWORK = {
    name: 'optimism',
    displayName: 'Optimism',
    type: '@tetherto/wdk-wallet-evm',
    module: '@tetherto/wdk-wallet-evm',
    nativeSymbol: 'ETH',
    decimals: 18,
    custom: true,
    testnet: false
  }

  beforeEach(() => {
    jest.spyOn(configService, 'get').mockImplementation((key) => {
      if (key === 'customNetworks') {
        return { optimism: DUMMY_CUSTOM_NETWORK }
      }
      return undefined
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns custom networks from config', () => {
    expect(getCustomNetworks()).toEqual({
      optimism: { ...DUMMY_CUSTOM_NETWORK, nativeSymbol: undefined, decimals: undefined }
    })
  })

  it('getAllNetworks merges built-in and custom', () => {
    expect(Object.keys(getAllNetworks())).toEqual([...BUILT_IN_NETWORK_NAMES, 'optimism'])
  })

  it('getAllNetworkNames includes custom networks', () => {
    expect(getAllNetworkNames()).toEqual([...BUILT_IN_NETWORK_NAMES, 'optimism'])
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
    expect(getNetworkConfig('optimism')).toEqual({
      ...DUMMY_CUSTOM_NETWORK, nativeSymbol: undefined, decimals: undefined
    })
  })

  it('isTestnet works with custom networks', () => {
    expect(isTestnet('optimism')).toBe(false)

    jest.restoreAllMocks()
    jest.spyOn(configService, 'get').mockImplementation((key) => {
      if (key === 'customNetworks') {
        return {
          'optimism-testnet': { ...DUMMY_CUSTOM_NETWORK, name: 'optimism-testnet', testnet: true }
        }
      }
      return undefined
    })

    expect(isTestnet('optimism-testnet')).toBe(true)
  })

  it('saveCustomNetwork stores to config', () => {
    const setMock = jest.spyOn(configService, 'set').mockImplementation(() => {})
    saveCustomNetwork('linea', DUMMY_CUSTOM_NETWORK)
    expect(setMock).toHaveBeenCalledTimes(1)
    expect(setMock.mock.calls[0]).toEqual(['customNetworks.linea', DUMMY_CUSTOM_NETWORK])
  })

  it('deleteCustomNetwork removes from config', () => {
    const deleteMock = jest.spyOn(configService, 'delete').mockImplementation(() => {})
    deleteCustomNetwork('optimism')
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(deleteMock.mock.calls[0]).toEqual(['customNetworks.optimism'])
  })

  it('returns empty object when no custom networks exist', () => {
    jest.restoreAllMocks()
    jest.spyOn(configService, 'get').mockImplementation(() => undefined)
    const custom = getCustomNetworks()
    expect(custom).toEqual({})
  })
})
