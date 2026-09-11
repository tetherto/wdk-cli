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

import { listTokens } from '../../../src/actions/token.js'
import { configService } from '../../../src/services/config-service.js'

const ETH_ENTRY = {
  symbol: 'ETH',
  decimals: 18,
  isNative: true,
  nativeId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  metadata: { moonpaySlug: 'eth', bitfinexSlug: 'tETHUSD' }
}

const USDT_ENTRY = {
  symbol: 'USDT',
  decimals: 6,
  isNative: false,
  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  metadata: { indexerSlug: 'usdt', moonpaySlug: 'usdt', bitfinexSlug: 'tUSTUSD' }
}

describe('listTokens', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  const withOverrides = (overrides) => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'overrides' ? overrides : undefined
    )
  }

  it('omits disabled tokens by default, as the MCP server sees them', () => {
    withOverrides({ tokens: { 'ethereum/usdt': { enabled: false } } })

    const result = listTokens({ network: 'ethereum' })

    expect(result.tokens.usdt).toBeUndefined()
    expect(result.tokens.eth).toEqual(ETH_ENTRY)
    expect(result.disabled).toEqual(['ethereum/usdt'])
  })

  it('returns disabled tokens when asked, alongside their ids', () => {
    withOverrides({ tokens: { 'ethereum/usdt': { enabled: false } } })

    const result = listTokens({ network: 'ethereum', includeDisabled: true })

    expect(result.tokens.usdt).toEqual(USDT_ENTRY)
    expect(result.disabled).toEqual(['ethereum/usdt'])
  })

  it('reports disabled ids across every network', () => {
    withOverrides({ tokens: { 'ethereum/usdt': { enabled: false } } })

    const result = listTokens({ includeDisabled: true })

    expect(result.tokens.ethereum.usdt).toEqual(USDT_ENTRY)
    expect(result.disabled).toEqual(['ethereum/usdt'])
  })
})
