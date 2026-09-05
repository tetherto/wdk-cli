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

import {
  selfDescribes,
  resolveChain,
  resolveToken,
  resolveRequestIdentifiers
} from '../../../src/services/protocol-identifier-resolver.js'

/**
 * A fake swidge-like protocol whose discovery methods return canned data.
 * A new object is created per test so the resolver's per-instance cache is fresh.
 */
const fakeProtocol = (chains, tokensByChain) => ({
  getSupportedChains: async () => chains,
  getSupportedTokens: async ({ fromChain } = {}) => tokensByChain[String(fromChain)] || []
})

describe('selfDescribes', () => {
  it('is true only when both discovery methods exist', () => {
    expect(selfDescribes(fakeProtocol([], {}))).toBe(true)
    expect(selfDescribes({ quoteSwap: () => {} })).toBe(false)
    expect(selfDescribes(null)).toBe(false)
  })
})

describe('resolveChain', () => {
  it('matches a numeric provider id against our chainId (symbiosis-style)', async () => {
    const p = fakeProtocol([{ id: 1, name: 'Ethereum' }], {})
    expect(await resolveChain(p, 'ethereum')).toBe(1)
  })

  it('matches a string provider id against the display name (rhino-style)', async () => {
    const p = fakeProtocol([{ id: 'ETHEREUM', name: 'Ethereum' }], {})
    expect(await resolveChain(p, 'ethereum')).toBe('ETHEREUM')
  })

  it('falls back to the network key when the name differs (avalanche)', async () => {
    // rhino names it "Avalanche" but our displayName is "Avalanche C-Chain";
    // the string id "AVALANCHE" still matches the network key.
    const p = fakeProtocol([{ id: 'AVALANCHE', name: 'Avalanche' }], {})
    expect(await resolveChain(p, 'avalanche')).toBe('AVALANCHE')
  })

  it('throws when the provider does not support the network', async () => {
    const p = fakeProtocol([{ id: 1, name: 'Ethereum' }], {})
    await expect(resolveChain(p, 'polygon')).rejects.toThrow(/not supported/)
  })
})

describe('resolveToken', () => {
  it('matches an ERC-20 by address and returns the provider token id (symbol for rhino)', async () => {
    const p = fakeProtocol([], { 1: [{ token: 'USDT', symbol: 'USDT', address: '0xAAA' }] })
    const out = await resolveToken(p, 1, { address: '0xaaa', symbol: 'USDT', isNative: false })
    expect(out).toBe('USDT')
  })

  it('matches an ERC-20 by address and returns the address (symbiosis)', async () => {
    const p = fakeProtocol([], { 1: [{ token: '0xAAA', symbol: 'USDT', address: '0xAAA' }] })
    const out = await resolveToken(p, 1, { address: '0xaaa', symbol: 'USDT', isNative: false })
    expect(out).toBe('0xAAA')
  })

  it('matches native by symbol (no address on the provider row)', async () => {
    const p = fakeProtocol([], { 1: [{ token: 'ETH', symbol: 'ETH' }] })
    const out = await resolveToken(p, 1, { address: '0xEeee', symbol: 'ETH', isNative: true })
    expect(out).toBe('ETH')
  })

  it('falls back to our address when the provider does not list the token', async () => {
    const p = fakeProtocol([], { 1: [{ token: '0xBBB', symbol: 'DAI', address: '0xBBB' }] })
    const out = await resolveToken(p, 1, { address: '0xAAA', symbol: 'USDT', isNative: false })
    expect(out).toBe('0xAAA')
  })
})

describe('resolveRequestIdentifiers', () => {
  const request = {
    fromToken: { address: '0xUSDT', decimals: 6, symbol: 'USDT', isNative: false },
    toToken: { address: '0xUSDT_AVAX', decimals: 6, symbol: 'USDT', isNative: false },
    toChain: 'avalanche',
    amountIn: 100n
  }

  it('returns the request unchanged for a non-self-describing protocol', async () => {
    const out = await resolveRequestIdentifiers({ quoteSwap: () => {} }, 'ethereum', request)
    expect(out).toBe(request)
  })

  it('translates tokens and resolves the destination chain for a swidge protocol', async () => {
    const p = fakeProtocol(
      [{ id: 1, name: 'Ethereum' }, { id: 43114, name: 'Avalanche' }],
      {
        1: [{ token: 'USDT', symbol: 'USDT', address: '0xUSDT' }],
        43114: [{ token: 'USDT', symbol: 'USDT', address: '0xUSDT_AVAX' }]
      }
    )

    const out = await resolveRequestIdentifiers(p, 'ethereum', request)

    expect(out.fromToken.address).toBe('USDT') // resolved via chain 1
    expect(out.toToken.address).toBe('USDT') // resolved via chain 43114 (not the source chain)
    expect(out.toChain).toBe(43114)
  })
})
