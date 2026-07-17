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
  toBaseUnits,
  getIndexerCode,
  getMoonpayCode,
  getBitfinexCode,
  getTokensSupportedBy,
  getAllTokens
} = await import('../../../src/services/token-service.js')

const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const USDT_SOL = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

const USDT_ETH_ENTRY = {
  symbol: 'USDT',
  decimals: 6,
  isNative: false,
  address: USDT_ETH,
  metadata: {
    indexerSlug: 'usdt',
    moonpaySlug: 'usdt',
    bitfinexSlug: 'tUSTUSD'
  }
}

const CUSTOM_ENTRY = {
  symbol: 'MYTOK',
  decimals: 9,
  isNative: false,
  address: '0x1111111111111111111111111111111111111111'
}

const BUILT_IN_NETWORKS = [
  'bitcoin', 'bitcoin-testnet3', 'ethereum', 'sepolia', 'polygon', 'arbitrum',
  'base', 'bsc', 'avalanche', 'solana', 'solana-testnet', 'solana-devnet',
  'spark', 'spark-regtest', 'tron', 'tron-testnet', 'smart-account-ethereum',
  'smart-account-sepolia', 'smart-account-polygon', 'smart-account-arbitrum',
  'smart-account-base', 'smart-account-plasma'
]

afterEach(() => {
  delete store.customTokens
})

describe('token-service', () => {
  it('resolves built-in tokens by name, case-insensitively', () => {
    expect(getTokenByName('ethereum', 'usdt')).toEqual(USDT_ETH_ENTRY)
    expect(getTokenByName('ethereum', 'USDT')).toEqual(USDT_ETH_ENTRY)
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
    expect(getTokenByAddress('ethereum', USDT_ETH.toLowerCase())).toEqual(USDT_ETH_ENTRY)
  })

  it('matches non-EVM addresses exactly', () => {
    expect(getTokenByAddress('solana', USDT_SOL)).toEqual({
      symbol: 'USDT',
      decimals: 6,
      isNative: false,
      address: USDT_SOL,
      metadata: {
        moonpaySlug: 'usdt_sol',
        bitfinexSlug: 'tUSTUSD'
      }
    })
    expect(getTokenByAddress('solana', USDT_SOL.toLowerCase())).toBeUndefined()
  })

  it('scopes address lookups to the network', () => {
    expect(getTokenByAddress('polygon', USDT_ETH)).toBeUndefined()
  })

  it('saveCustomToken persists the entry to config', () => {
    saveCustomToken('ethereum', 'MyTok', CUSTOM_ENTRY)

    expect(store.customTokens).toEqual({ ethereum: { mytok: CUSTOM_ENTRY } })
  })

  it('resolves custom tokens by name', () => {
    store.customTokens = { ethereum: { mytok: CUSTOM_ENTRY } }

    expect(getTokenByName('ethereum', 'mytok')).toEqual(CUSTOM_ENTRY)
  })

  it('custom tokens override built-ins', () => {
    const override = {
      symbol: 'USDT',
      decimals: 6,
      isNative: false,
      address: '0x2222222222222222222222222222222222222222'
    }
    store.customTokens = { ethereum: { usdt: override } }

    expect(getTokenByName('ethereum', 'usdt')).toEqual(override)
  })

  it('reports the token source', () => {
    store.customTokens = { ethereum: { mytok: CUSTOM_ENTRY } }

    expect(getTokenSource('ethereum', 'mytok')).toBe('custom')
    expect(getTokenSource('ethereum', 'usdt')).toBe('built-in')
    expect(getTokenSource('ethereum', 'nope')).toBeUndefined()
  })

  it('identifies built-in tokens', () => {
    store.customTokens = { ethereum: { mytok: CUSTOM_ENTRY } }

    expect(isBuiltinToken('ethereum', 'usdt')).toBe(true)
    expect(isBuiltinToken('ethereum', 'mytok')).toBe(false)
  })

  it('includes custom tokens in the network listing', () => {
    store.customTokens = { ethereum: { mytok: CUSTOM_ENTRY } }

    const tokens = getTokensForNetwork('ethereum')

    expect(Object.keys(tokens)).toEqual(['eth', 'usdt', 'xaut', 'mytok'])
    expect(tokens.mytok).toEqual(CUSTOM_ENTRY)
  })

  it('deleteCustomToken removes the entry', () => {
    store.customTokens = { ethereum: { mytok: CUSTOM_ENTRY } }

    expect(deleteCustomToken('ethereum', 'mytok')).toBe(true)
    expect(store.customTokens.ethereum).toEqual({})
    expect(deleteCustomToken('ethereum', 'mytok')).toBe(false)
  })

  it('returns the indexer slug', () => {
    expect(getIndexerCode('ethereum', 'usdt')).toBe('usdt')
    expect(getIndexerCode('ethereum', 'eth')).toBeUndefined()
  })

  it('returns the MoonPay slug', () => {
    expect(getMoonpayCode('ethereum', 'eth')).toBe('eth')
    expect(getMoonpayCode('ethereum', 'nope')).toBeUndefined()
  })

  it('returns the Bitfinex slug', () => {
    expect(getBitfinexCode('ethereum', 'xaut')).toBe('tXAUT:USD')
    expect(getBitfinexCode('ethereum', 'nope')).toBeUndefined()
  })

  it('lists tokens supported by a provider', () => {
    expect(getTokensSupportedBy('ethereum', 'indexerSlug')).toEqual(['usdt', 'xaut'])
    expect(getTokensSupportedBy('ethereum', 'moonpaySlug')).toEqual(['eth', 'usdt', 'xaut'])
  })

  it('returns all tokens grouped by network', () => {
    store.customTokens = { mynet: { tok: CUSTOM_ENTRY } }

    const all = getAllTokens()

    expect(Object.keys(all)).toEqual([...BUILT_IN_NETWORKS, 'mynet'])
    expect(all.ethereum.usdt).toEqual(USDT_ETH_ENTRY)
    expect(all.mynet.tok).toEqual(CUSTOM_ENTRY)
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
