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
  setNetworkEnabled,
  isNetworkDisabled,
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
      module: '@tetherto/wdk-wallet-evm',
      nativeSymbol: 'ETH',
      decimals: 18,
      testnet: false
    })
    expect(NETWORKS.bitcoin).toEqual({
      name: 'bitcoin',
      displayName: 'Bitcoin',
      type: '@tetherto/wdk-wallet-btc',
      module: '@tetherto/wdk-wallet-btc',
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

describe('network overrides', () => {
  const DUMMY_CUSTOM_NETWORK = {
    name: 'mychain',
    displayName: 'mychain',
    type: '@tetherto/wdk-wallet-evm',
    module: '@tetherto/wdk-wallet-evm',
    custom: true,
    testnet: false
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const withOverrides = (overrides) => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'overrides' ? overrides : undefined
    )
  }

  it('hides a disabled network and reports it as disabled', () => {
    withOverrides({ networks: { tron: { enabled: false } } })

    expect(isValidNetwork('tron')).toBe(false)
    expect(getAllNetworkNames()).toEqual(BUILT_IN_NETWORK_NAMES.filter((n) => n !== 'tron'))
    expect(() => getNetworkConfig('tron')).toThrow("Network 'tron' is disabled.")
  })

  it('disables a built-in network', () => {
    const setMock = jest.spyOn(configService, 'set').mockImplementation(() => {})
    withOverrides(undefined)

    expect(setNetworkEnabled('tron', false)).toBe(false)
    expect(setMock).toHaveBeenCalledWith('overrides', { networks: { tron: { enabled: false } } })
  })

  it('enables a disabled network by removing the delta', () => {
    const deleteMock = jest.spyOn(configService, 'delete').mockImplementation(() => {})
    withOverrides({ networks: { tron: { enabled: false } } })

    expect(setNetworkEnabled('tron', true)).toBe(false)
    expect(deleteMock).toHaveBeenCalledWith('overrides')
  })

  it('rejects a network already in the desired state', () => {
    withOverrides(undefined)

    expect(() => setNetworkEnabled('tron', true)).toThrow("'tron' is already enabled.")
  })

  it('rejects a module name, since only network names match', () => {
    withOverrides(undefined)

    expect(() => setNetworkEnabled('@tetherto/wdk-wallet-tron', false)).toThrow(
      "'@tetherto/wdk-wallet-tron' is not a network."
    )
  })

  it('rejects an unknown name', () => {
    withOverrides(undefined)

    expect(() => setNetworkEnabled('nope', false)).toThrow("'nope' is not a network.")
  })

  const withDisabledCustomNetwork = () => {
    jest.spyOn(configService, 'get').mockImplementation((key) => {
      if (key === 'customNetworks') return { mychain: DUMMY_CUSTOM_NETWORK }
      if (key === 'overrides') return { networks: { mychain: { enabled: false } } }
      return undefined
    })
  }

  it('disables a custom network', () => {
    const setMock = jest.spyOn(configService, 'set').mockImplementation(() => {})
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'customNetworks' ? { mychain: DUMMY_CUSTOM_NETWORK } : undefined
    )

    expect(setNetworkEnabled('mychain', false)).toBe(false)
    expect(setMock).toHaveBeenCalledWith('overrides', { networks: { mychain: { enabled: false } } })
  })

  it('isValidNetwork rejects a disabled custom network', () => {
    withDisabledCustomNetwork()

    expect(isValidNetwork('mychain')).toBe(false)
  })

  it('isNetworkDisabled identifies a disabled custom network', () => {
    withDisabledCustomNetwork()

    expect(isNetworkDisabled('mychain')).toBe(true)
    expect(isNetworkDisabled('ethereum')).toBe(false)
    expect(isNetworkDisabled('nope')).toBe(false)
  })

  it('getNetworkConfig resolves a disabled custom network for inspection', () => {
    withDisabledCustomNetwork()

    expect(getNetworkConfig('mychain', { includeDisabled: true })).toEqual({
      ...DUMMY_CUSTOM_NETWORK,
      nativeSymbol: undefined,
      decimals: undefined
    })
  })

  it('clears the override when the custom network is deleted', () => {
    const deleteMock = jest.spyOn(configService, 'delete').mockImplementation(() => {})
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'overrides' ? { networks: { mychain: { enabled: false } } } : undefined
    )

    deleteCustomNetwork('mychain')

    expect(deleteMock).toHaveBeenCalledWith('customNetworks.mychain')
    expect(deleteMock).toHaveBeenCalledWith('overrides')
  })

  it('clears a stale override on enable', () => {
    const deleteMock = jest.spyOn(configService, 'delete').mockImplementation(() => {})
    withOverrides({ networks: { 'gone-net': { enabled: false } } })

    expect(setNetworkEnabled('gone-net', true)).toBe(true)
    expect(deleteMock).toHaveBeenCalledWith('overrides')
  })

  it('hides all networks of a disabled wallet module', () => {
    withOverrides({ modules: { '@tetherto/wdk-wallet-solana': { enabled: false } } })

    expect(getAllNetworkNames()).toEqual(
      BUILT_IN_NETWORK_NAMES.filter((n) => !n.startsWith('solana'))
    )
    expect(() => getNetworkConfig('solana')).toThrow("Network 'solana' is disabled.")
  })

  it('applies a module replacement to a network', () => {
    withOverrides({ networks: { ethereum: { module: '@acme/evm-wallet' } } })

    expect(getAllNetworks().ethereum).toEqual({
      name: 'ethereum',
      displayName: 'Ethereum',
      type: '@acme/evm-wallet',
      module: '@acme/evm-wallet',
      nativeSymbol: 'ETH',
      decimals: 18,
      testnet: false
    })
  })

  it('hides custom networks whose module is disabled', () => {
    jest.spyOn(configService, 'get').mockImplementation((key) => {
      if (key === 'overrides') {
        return { modules: { '@tetherto/wdk-wallet-evm': { enabled: false } } }
      }
      if (key === 'customNetworks') {
        return { mychain: { name: 'mychain', module: '@tetherto/wdk-wallet-evm' } }
      }
      return undefined
    })

    expect(isValidNetwork('mychain')).toBe(false)
    expect(isValidNetwork('ethereum')).toBe(false)
    expect(isValidNetwork('bitcoin')).toBe(true)
  })

  it('leaves the raw built-in registry untouched', () => {
    withOverrides({ networks: { tron: { enabled: false } } })

    expect(isBuiltinNetwork('tron')).toBe(true)
    expect(NETWORK_NAMES).toEqual(BUILT_IN_NETWORK_NAMES)
  })
})
