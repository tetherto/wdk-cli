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

// In-memory config store with dot-path access, replacing the conf-backed service.
const store = {}

function resolvePath (obj, key) {
  const parts = key.split('.')
  const last = parts.pop()
  let node = obj
  for (const part of parts) {
    if (node === undefined || node === null) return { node: undefined, last }
    node = node[part]
  }
  return { node, last }
}

jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: {
    get (key) {
      const { node, last } = resolvePath(store, key)
      return node?.[last]
    },
    set (key, value) {
      const parts = key.split('.')
      const last = parts.pop()
      let node = store
      for (const part of parts) {
        if (typeof node[part] !== 'object' || node[part] === null) node[part] = {}
        node = node[part]
      }
      node[last] = value
    },
    delete (key) {
      const { node, last } = resolvePath(store, key)
      if (node) delete node[last]
    }
  }
}))

const {
  getTokenByName,
  getTokenByAddress,
  getTokensForNetwork,
  getNativeToken,
  getTokenSource,
  isBuiltinToken,
  resolveTokenIdentifier,
  saveCustomToken,
  deleteCustomToken,
  toBaseUnits
} = await import('../../../src/services/token-service.js')

const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const USDT_SOL = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

afterEach(() => {
  delete store.customTokens
})

describe('token-service', () => {
  it('resolves built-in tokens by name, case-insensitively', () => {
    expect(getTokenByName('ethereum', 'usdt')).toEqual({
      symbol: 'USDT',
      decimals: 6,
      isNative: false,
      address: USDT_ETH,
      metadata: {
        indexerSlug: 'usdt',
        moonpaySlug: 'usdt',
        bitfinexSlug: 'tUSTUSD'
      }
    })
    expect(getTokenByName('ethereum', 'USDT')).toEqual(getTokenByName('ethereum', 'usdt'))
    expect(getTokenByName('ethereum', 'nope')).toBeUndefined()
  })

  it('returns entries without registry-internal fields', () => {
    const entry = getTokenByName('ethereum', 'usdt')
    expect(Object.keys(entry).sort()).toEqual(['address', 'decimals', 'isNative', 'metadata', 'symbol'])
  })

  it('resolves the native token', () => {
    expect(getNativeToken('ethereum')).toEqual({
      symbol: 'ETH',
      decimals: 18,
      isNative: true,
      metadata: {
        moonpaySlug: 'eth',
        bitfinexSlug: 'tETHUSD'
      }
    })
  })

  it('matches EVM addresses case-insensitively', () => {
    expect(getTokenByAddress('ethereum', USDT_ETH.toLowerCase())?.symbol).toBe('USDT')
  })

  it('matches non-EVM addresses exactly', () => {
    expect(getTokenByAddress('solana', USDT_SOL)?.symbol).toBe('USDT')
    expect(getTokenByAddress('solana', USDT_SOL.toLowerCase())).toBeUndefined()
  })

  it('scopes address lookups to the network', () => {
    expect(getTokenByAddress('polygon', USDT_ETH)).toBeUndefined()
  })

  it('merges custom tokens and lets them override built-ins', () => {
    saveCustomToken('ethereum', 'mytok', {
      symbol: 'MYTOK',
      decimals: 9,
      isNative: false,
      address: '0x1111111111111111111111111111111111111111'
    })
    saveCustomToken('ethereum', 'usdt', {
      symbol: 'USDT',
      decimals: 6,
      isNative: false,
      address: '0x2222222222222222222222222222222222222222'
    })

    expect(getTokenByName('ethereum', 'mytok')?.symbol).toBe('MYTOK')
    expect(getTokenByName('ethereum', 'usdt')?.address).toBe('0x2222222222222222222222222222222222222222')
    expect(getTokenSource('ethereum', 'mytok')).toBe('custom')
    expect(getTokenSource('ethereum', 'usdt')).toBe('custom')
    expect(isBuiltinToken('ethereum', 'usdt')).toBe(true)
    expect(isBuiltinToken('ethereum', 'mytok')).toBe(false)

    const tokens = getTokensForNetwork('ethereum')
    expect(Object.keys(tokens)).toEqual(['eth', 'usdt', 'xaut', 'mytok'])

    expect(deleteCustomToken('ethereum', 'mytok')).toBe(true)
    expect(deleteCustomToken('ethereum', 'mytok')).toBe(false)
    expect(getTokenByName('ethereum', 'mytok')).toBeUndefined()
    expect(getTokenSource('ethereum', 'usdt')).toBe('custom')
  })

  it('resolves token identifiers for native and contract tokens', () => {
    expect(resolveTokenIdentifier('ethereum', 'eth')).toEqual({ isNative: true, address: undefined })
    expect(resolveTokenIdentifier('ethereum', 'usdt')).toEqual({ isNative: false, address: USDT_ETH })
    expect(() => resolveTokenIdentifier('ethereum', 'nope')).toThrow(/not registered/)
  })

  it('converts human amounts to base units using registered decimals', () => {
    expect(toBaseUnits('ethereum', 'usdt', '1.5')).toBe('1500000')
    expect(toBaseUnits('ethereum', undefined, '2')).toBe('2000000000000000000')
    expect(() => toBaseUnits('ethereum', 'usdt', '1.1234567')).toThrow(/precision/)
  })
})
