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

const getConfig = jest.fn()

// Mocked, not spied on: the real service reads the developer's own config file.
jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: { get: getConfig, set: jest.fn(), delete: jest.fn() }
}))

const { listNetworks, validateNetworkSpec } = await import('../../../src/actions/networks.js')
const { NETWORK_NAMES } = await import('../../../src/config/networks.js')

const TRON_ENTRY = {
  name: 'tron',
  displayName: 'Tron',
  module: '@tetherto/wdk-wallet-tron',
  type: '@tetherto/wdk-wallet-tron',
  symbol: 'TRX',
  decimals: 6,
  testnet: false,
  custom: false,
  enabled: false
}

describe('listNetworks', () => {
  beforeEach(() => {
    getConfig.mockReset()
  })

  const withOverrides = (overrides) => {
    getConfig.mockImplementation((key) => (key === 'overrides' ? overrides : undefined))
  }

  it('omits disabled networks by default, as the MCP server sees them', () => {
    withOverrides({ networks: { tron: { enabled: false } } })

    const result = listNetworks({})
    const expected = NETWORK_NAMES.filter((n) => n !== 'tron')

    expect(result.networks.map((n) => n.name)).toEqual(expected)
    expect(result.count).toBe(expected.length)
  })

  it('returns disabled networks marked as such when asked', () => {
    withOverrides({ networks: { tron: { enabled: false } } })

    const result = listNetworks({ includeDisabled: true })

    expect(result.networks.map((n) => n.name)).toEqual(NETWORK_NAMES)
    expect(result.networks.find((n) => n.name === 'tron')).toEqual(TRON_ENTRY)
  })

  it('keeps a disabled testnet in the --testnet listing', () => {
    withOverrides({ networks: { sepolia: { enabled: false } } })

    const result = listNetworks({ testnet: true, includeDisabled: true })
    const sepolia = result.networks.find((n) => n.name === 'sepolia')

    expect(sepolia.testnet).toBe(true)
    expect(sepolia.enabled).toBe(false)
  })

  it('leaves networks hidden by a disabled module out of the listing', () => {
    withOverrides({ modules: { '@tetherto/wdk-wallet-solana': { enabled: false } } })

    const result = listNetworks({ includeDisabled: true })
    const expected = NETWORK_NAMES.filter((n) => !n.startsWith('solana'))

    expect(result.networks.map((n) => n.name)).toEqual(expected)
    expect(result.networks.filter((n) => !n.enabled)).toEqual([])
  })
})

describe('validateNetworkSpec name collisions', () => {
  const SPEC = { network: 'polygon', module: '@tetherto/wdk-wallet-evm' }

  beforeEach(() => {
    getConfig.mockReset()
  })

  const withConfig = (values) => {
    getConfig.mockImplementation((key) => (Object.hasOwn(values, key) ? values[key] : undefined))
  }

  it('rejects the name of a built-in network', () => {
    withConfig({})

    expect(() => validateNetworkSpec(SPEC)).toThrow(
      expect.objectContaining({ message: "Network 'polygon' already exists.", code: 'WALLET_EXISTS' })
    )
  })

  it('rejects the name of a built-in the user disabled, which delete could never remove', () => {
    withConfig({ overrides: { networks: { polygon: { enabled: false } } } })

    expect(() => validateNetworkSpec(SPEC)).toThrow(
      expect.objectContaining({ message: "Network 'polygon' already exists.", code: 'WALLET_EXISTS' })
    )
  })

  it('rejects the name of a built-in hidden by its disabled module', () => {
    withConfig({ overrides: { modules: { '@tetherto/wdk-wallet-evm': { enabled: false } } } })

    expect(() => validateNetworkSpec(SPEC)).toThrow("Network 'polygon' already exists.")
  })

  it('rejects the name of an existing custom network', () => {
    withConfig({ customNetworks: { mychain: { name: 'mychain', module: '@tetherto/wdk-wallet-evm' } } })

    expect(() => validateNetworkSpec({ network: 'mychain', module: '@tetherto/wdk-wallet-evm' })).toThrow(
      "Network 'mychain' already exists."
    )
  })

  it('rejects the name of a custom network the user disabled', () => {
    withConfig({
      customNetworks: { mychain: { name: 'mychain', module: '@tetherto/wdk-wallet-evm' } },
      overrides: { networks: { mychain: { enabled: false } } }
    })

    expect(() => validateNetworkSpec({ network: 'mychain', module: '@tetherto/wdk-wallet-evm' })).toThrow(
      expect.objectContaining({ message: "Network 'mychain' already exists.", code: 'WALLET_EXISTS' })
    )
  })

  it('rejects the name of a custom network hidden by its disabled module', () => {
    withConfig({
      customNetworks: { mychain: { name: 'mychain', module: '@tetherto/wdk-wallet-evm' } },
      overrides: { modules: { '@tetherto/wdk-wallet-evm': { enabled: false } } }
    })

    expect(() => validateNetworkSpec({ network: 'mychain', module: '@tetherto/wdk-wallet-evm' })).toThrow(
      expect.objectContaining({ message: "Network 'mychain' already exists.", code: 'WALLET_EXISTS' })
    )
  })

  it('accepts a name no network uses', () => {
    withConfig({})

    expect(validateNetworkSpec({ network: 'mychain', module: '@tetherto/wdk-wallet-evm' })).toMatchObject({
      network: 'mychain',
      module: '@tetherto/wdk-wallet-evm'
    })
  })
})
