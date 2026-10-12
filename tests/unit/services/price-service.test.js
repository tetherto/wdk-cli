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

const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const getLastPrice = jest.fn()
const getMultiLastPriceData = jest.fn()
const resolvePricingProvider = jest.fn()

jest.unstable_mockModule('../../../src/services/pricing/index.js', () => ({
  PRICING: 'pricing',
  resolvePricingProvider
}))

const { convertToUsd, getNativeUsdPrice, convertManyNativeToUsd } =
  await import('../../../src/services/price-service.js')

beforeEach(() => {
  getLastPrice.mockReset()
  getMultiLastPriceData.mockReset()
  resolvePricingProvider.mockReset()
  resolvePricingProvider.mockResolvedValue({
    name: 'bitfinex',
    provider: { getLastPrice, getMultiLastPriceData }
  })
})

describe('convertToUsd', () => {
  it('converts a native amount at the feed price', async () => {
    getLastPrice.mockResolvedValue(2000)

    const usd = await convertToUsd('ethereum', 1_000_000_000_000_000_000n)

    expect(getLastPrice).toHaveBeenCalledWith('ETH', 'USD')
    expect(usd).toBe(2000)
  })

  it('converts a token amount at the feed price', async () => {
    getLastPrice.mockResolvedValue(1)

    const usd = await convertToUsd('ethereum', 1_000_000n, USDT_ETH)

    expect(usd).toBe(1)
  })

  it('rounds to two decimals above Number.MAX_SAFE_INTEGER', async () => {
    getLastPrice.mockResolvedValue(1)

    // 1.234567890123456789 ETH at $1
    const usd = await convertToUsd('ethereum', 1_234_567_890_123_456_789n)

    expect(usd).toBe(1.23)
  })

  it('rejects a token the registry does not know', async () => {
    await expect(
      convertToUsd('ethereum', 1n, '0x0000000000000000000000000000000000000001')
    ).rejects.toThrow("Unknown token 0x0000000000000000000000000000000000000001 on ethereum.")
  })
})

describe('feed symbol resolution', () => {
  it('sends the registered slug when the feed names the token differently', async () => {
    getLastPrice.mockResolvedValue(1)

    await getNativeUsdPrice('tron')

    // tron/trx carries no bitfinex slug, so the symbol is used as-is
    expect(getLastPrice).toHaveBeenCalledWith('TRX', 'USD')
  })

  it('sends UST for tether, which Bitfinex does not list as USDT', async () => {
    getLastPrice.mockResolvedValue(1)

    await convertToUsd('ethereum', 1_000_000n, USDT_ETH)

    expect(getLastPrice).toHaveBeenCalledWith('UST', 'USD')
  })

  it('asks the feed the token names it, not the kind', async () => {
    getLastPrice.mockResolvedValue(1)
    resolvePricingProvider.mockResolvedValue({ name: 'coingecko', provider: { getLastPrice } })

    await convertToUsd('ethereum', 1_000_000n, USDT_ETH)

    // usdt carries no coingecko slug, so the fallback sends the symbol itself
    expect(getLastPrice).toHaveBeenCalledWith('USDT', 'USD')
  })
})

describe('when the feed has no price', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', NaN]
  ])('reports no price when the feed answers %s', async (_label, answer) => {
    getLastPrice.mockResolvedValue(answer)

    await expect(getNativeUsdPrice('ethereum')).rejects.toThrow(
      expect.objectContaining({
        message: 'No USD price available for ETH on ethereum.',
        code: 'TOKEN_NOT_SUPPORTED'
      })
    )
  })

  it('surfaces a feed that is unavailable', async () => {
    resolvePricingProvider.mockRejectedValue(new Error('No price feed is available.'))

    await expect(getNativeUsdPrice('ethereum')).rejects.toThrow('No price feed is available.')
  })
})

describe('convertManyNativeToUsd', () => {
  it('asks the feed once for every network, not once per network', async () => {
    getMultiLastPriceData.mockResolvedValue([
      { lastPrice: 100000 },
      { lastPrice: 2000 },
      { lastPrice: 0.3 }
    ])

    const usd = await convertManyNativeToUsd([
      { network: 'bitcoin', amount: 100_000_000n },
      { network: 'ethereum', amount: 1_000_000_000_000_000_000n },
      { network: 'tron', amount: 1_000_000n }
    ])

    expect(getMultiLastPriceData).toHaveBeenCalledTimes(1)
    expect(getMultiLastPriceData).toHaveBeenCalledWith([
      { from: 'BTC', to: 'USD' },
      { from: 'ETH', to: 'USD' },
      { from: 'TRX', to: 'USD' }
    ])
    expect(usd.get('bitcoin')).toBe(100000)
    expect(usd.get('ethereum')).toBe(2000)
    expect(usd.get('tron')).toBe(0.3)
  })

  it('leaves out a network the feed does not price', async () => {
    getMultiLastPriceData.mockResolvedValue([{ lastPrice: 100000 }, { lastPrice: null }])

    const usd = await convertManyNativeToUsd([
      { network: 'bitcoin', amount: 100_000_000n },
      { network: 'ethereum', amount: 1_000_000_000_000_000_000n }
    ])

    expect(usd.get('bitcoin')).toBe(100000)
    expect(usd.has('ethereum')).toBe(false)
  })

  it('keeps the prices it can get when the feed rejects the whole batch', async () => {
    getMultiLastPriceData.mockRejectedValue(new Error('Unknown symbol: TRX'))
    getLastPrice.mockImplementation(async (from) => {
      if (from === 'TRX') throw new Error('Unknown symbol: TRX')
      return from === 'BTC' ? 100000 : 2000
    })

    const usd = await convertManyNativeToUsd([
      { network: 'bitcoin', amount: 100_000_000n },
      { network: 'tron', amount: 1_000_000n },
      { network: 'ethereum', amount: 1_000_000_000_000_000_000n }
    ])

    expect(usd.get('bitcoin')).toBe(100000)
    expect(usd.get('ethereum')).toBe(2000)
    expect(usd.has('tron')).toBe(false)
  })

  it('does not call the feed for an empty set', async () => {
    const usd = await convertManyNativeToUsd([])

    expect(usd.size).toBe(0)
    expect(resolvePricingProvider).not.toHaveBeenCalled()
  })
})
