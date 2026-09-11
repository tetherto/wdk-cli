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

import { listNetworks } from '../../../src/actions/networks.js'
import { NETWORK_NAMES } from '../../../src/config/networks.js'
import { configService } from '../../../src/services/config-service.js'

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
  afterEach(() => {
    jest.restoreAllMocks()
  })

  const withOverrides = (overrides) => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'overrides' ? overrides : undefined
    )
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

  it('marks networks hidden by a disabled module', () => {
    withOverrides({ modules: { '@tetherto/wdk-wallet-solana': { enabled: false } } })

    const result = listNetworks({ includeDisabled: true })

    expect(result.networks.filter((n) => !n.enabled).map((n) => n.name)).toEqual([
      'solana', 'solana-testnet', 'solana-devnet'
    ])
  })
})
