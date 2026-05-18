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

import { describe, it, expect, beforeEach, vi } from 'vitest'

const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7'

function tickerResponse(prices: Record<string, number>) {
  return Object.entries(prices).map(([sym, price]) => [sym, 0, 0, 0, 0, 0, 0, price, 0, 0, 0])
}

const DEFAULT_PRICES = { tETHUSD: 2000, tUSTUSD: 1 }

function mockFetch(prices: Record<string, number> = DEFAULT_PRICES) {
  const fn = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => tickerResponse(prices) } as Response))
  vi.stubGlobal('fetch', fn)
  return fn
}

async function loadService() {
  vi.resetModules()
  return await import('../../../src/services/price-service.js')
}

describe('price-service', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('converts 1 ETH to USD', async () => {
    mockFetch()
    const { convertToUsd } = await loadService()
    const usd = await convertToUsd('ethereum', 1_000_000_000_000_000_000n)
    expect(usd).toBe(2000)
  })

  it('converts 1 USDT (token) to USD', async () => {
    mockFetch()
    const { convertToUsd } = await loadService()
    const usd = await convertToUsd('ethereum', 1_000_000n, USDT_ETH)
    expect(usd).toBe(1)
  })

  it('preserves precision for bigint above Number.MAX_SAFE_INTEGER', async () => {
    mockFetch({ ...DEFAULT_PRICES, tETHUSD: 1 })
    const { convertToUsd } = await loadService()
    const usd = await convertToUsd('ethereum', 1_234_567_890_123_456_789n)
    expect(Number.isFinite(usd)).toBe(true)
    expect(usd).toBeCloseTo(1.234567890123456789, 12)
  })

  it('throws for unknown token', async () => {
    mockFetch()
    const { convertToUsd } = await loadService()
    await expect(convertToUsd('ethereum', 1n, '0x0000000000000000000000000000000000000001'))
      .rejects.toThrow(/Unknown token/)
  })

  it('caches prices across calls within TTL', async () => {
    const fetchFn = mockFetch()
    const { convertToUsd } = await loadService()
    await convertToUsd('ethereum', 1_000_000_000_000_000_000n)
    await convertToUsd('ethereum', 2_000_000_000_000_000_000n)
    await convertToUsd('ethereum', 1_000_000n, USDT_ETH)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('throws when Bitfinex API returns non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error' } as Response)))
    const { convertToUsd } = await loadService()
    await expect(convertToUsd('ethereum', 1n)).rejects.toThrow(/Bitfinex API error/)
  })
})
