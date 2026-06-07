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
const DEFAULT_PRICES = { tETHUSD: 2000, tUSTUSD: 1 }

function tickerResponse (prices) {
  return Object.entries(prices).map(([sym, price]) => [sym, 0, 0, 0, 0, 0, 0, price, 0, 0, 0])
}

function makeFetchMock (prices = DEFAULT_PRICES) {
  const state = { calls: 0 }
  const fn = async () => {
    state.calls++
    return { ok: true, status: 200, statusText: 'OK', json: async () => tickerResponse(prices) }
  }
  fn.callCount = () => state.calls
  return fn
}

let importCounter = 0
async function loadService () {
  importCounter++
  jest.resetModules()
  return await import(`../../../src/services/price-service.js?n=${importCounter}`)
}

describe('price-service', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  it('converts 1 ETH to USD', async () => {
    globalThis.fetch = makeFetchMock()
    try {
      const { convertToUsd } = await loadService()
      const usd = await convertToUsd('ethereum', 1_000_000_000_000_000_000n)
      expect(usd).toBe(2000)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('converts 1 USDT (token) to USD', async () => {
    globalThis.fetch = makeFetchMock()
    try {
      const { convertToUsd } = await loadService()
      const usd = await convertToUsd('ethereum', 1_000_000n, USDT_ETH)
      expect(usd).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('handles bigint above Number.MAX_SAFE_INTEGER (rounded to 2 dp)', async () => {
    globalThis.fetch = makeFetchMock({ ...DEFAULT_PRICES, tETHUSD: 1 })
    try {
      const { convertToUsd } = await loadService()
      // 1.234567890123456789 ETH @ $1 → rounds to $1.23
      const amount = 1_234_567_890_123_456_789n
      const usd = await convertToUsd('ethereum', amount)
      expect(Number.isFinite(usd)).toBe(true)
      expect(usd).toBe(1.23)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('throws for unknown token', async () => {
    globalThis.fetch = makeFetchMock()
    try {
      const { convertToUsd } = await loadService()
      await expect(
        convertToUsd('ethereum', 1n, '0x0000000000000000000000000000000000000001')
      ).rejects.toThrow(/Unknown token/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('caches prices across calls within TTL', async () => {
    const fetchFn = makeFetchMock()
    globalThis.fetch = fetchFn
    try {
      const { convertToUsd } = await loadService()
      await convertToUsd('ethereum', 1_000_000_000_000_000_000n)
      await convertToUsd('ethereum', 2_000_000_000_000_000_000n)
      await convertToUsd('ethereum', 1_000_000n, USDT_ETH)
      expect(fetchFn.callCount()).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('throws when Bitfinex API returns non-OK', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500, statusText: 'Server Error' })
    try {
      const { convertToUsd } = await loadService()
      await expect(convertToUsd('ethereum', 1n)).rejects.toThrow(/Bitfinex API error/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
