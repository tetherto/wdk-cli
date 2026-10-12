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

import { listTokens, validateTokenEntry } from '../../../src/actions/token.js'
import { configService } from '../../../src/services/config-service.js'

const ETH_ENTRY = {
  symbol: 'ETH',
  decimals: 18,
  isNative: true,
  nativeId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  metadata: { slugs: { moonpay: 'eth', transak: { slug: 'ETH', network: 'ethereum' } } }
}

const USDT_ENTRY = {
  symbol: 'USDT',
  decimals: 6,
  isNative: false,
  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  metadata: {
    slugs: { indexer: 'usdt', moonpay: 'usdt', bitfinex: 'UST', transak: { slug: 'USDT', network: 'ethereum' } }
  }
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

  it('leaves out the tokens of a disabled network and of a module-disabled one', () => {
    withOverrides({
      networks: { tron: { enabled: false } },
      modules: { '@tetherto/wdk-wallet-solana': { enabled: false } },
      tokens: { 'tron/usdt': { enabled: false }, 'ethereum/usdt': { enabled: false } }
    })

    const result = listTokens({ includeDisabled: true })

    expect(result.tokens.tron).toBeUndefined()
    expect(result.tokens.solana).toBeUndefined()
    expect(result.tokens['tron-testnet'].trx.symbol).toBe('TRX')
    expect(result.tokens.ethereum.usdt).toEqual(USDT_ENTRY)
    expect(result.disabled).toEqual(['ethereum/usdt'])
  })
})

describe('validateTokenEntry metadata', () => {
  const BASE = { symbol: 'TX', decimals: 6, isNative: false, address: '0x9' }

  const withMetadata = (metadata) => validateTokenEntry({ ...BASE, metadata })

  it('keeps a slug string as written', () => {
    expect(withMetadata({ slugs: { moonpay: 'usdt_trx' } }).metadata).toEqual({
      slugs: { moonpay: 'usdt_trx' }
    })
  })

  it('keeps the object form whole, so a system\'s extra fields survive', () => {
    expect(withMetadata({ slugs: { transak: { slug: 'USDT', network: 'tron' } } }).metadata).toEqual({
      slugs: { transak: { slug: 'USDT', network: 'tron' } } }
    )
  })

  it('omits metadata entirely when the block is empty', () => {
    expect(withMetadata({ slugs: {} }).metadata).toBeUndefined()
  })

  it('rejects a pre-slugs field instead of dropping it silently', () => {
    expect(() => withMetadata({ moonpaySlug: 'usdt' })).toThrow(
      expect.objectContaining({
        message: 'Token "metadata" has unknown field(s): moonpaySlug.',
        code: 'INVALID_ARGUMENT'
      })
    )
  })

  it('rejects an unregistered field beside slugs', () => {
    expect(() => withMetadata({ slugs: { moonpay: 'usdt' }, note: 'hi' })).toThrow(
      'Token "metadata" has unknown field(s): note.'
    )
  })

  it('rejects __proto__ as a system name, which assignment would otherwise swallow', () => {
    const metadata = JSON.parse('{"slugs":{"__proto__":{"slug":"pwned"}}}')

    expect(() => withMetadata(metadata)).toThrow(
      'Token "metadata.slugs" cannot use "__proto__" as a system name.'
    )
    expect({}.slug).toBeUndefined()
  })

  it.each([
    ['an empty string', { transak: '' }, 'Token "metadata.slugs.transak" must be a non-empty string.'],
    ['a number', { transak: 42 }, 'Token "metadata.slugs.transak" must be a string or an object.'],
    ['an array', { transak: [] }, 'Token "metadata.slugs.transak" must be a string or an object.'],
    ['an object with no slug', { transak: { network: 'tron' } }, 'Token "metadata.slugs.transak" is missing "slug".'],
    ['an object with an empty slug', { transak: { slug: '' } }, 'Token "metadata.slugs.transak.slug" must be a non-empty string.']
  ])('rejects %s', (_label, slugs, message) => {
    expect(() => withMetadata({ slugs })).toThrow(message)
  })

  it('rejects a slugs block that is not an object', () => {
    expect(() => withMetadata({ slugs: 'moonpay' })).toThrow(
      'Token "metadata.slugs" must be an object when provided.'
    )
  })
})
