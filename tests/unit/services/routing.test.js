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

import { pickBest, buildNoRouteError } from '../../../src/services/routing.js'

describe('pickBest', () => {
  it('returns the quote with the highest output amount', () => {
    const quotes = [
      { protocol: 'velora', outputAmount: 4700n, raw: {} },
      { protocol: 'lifi', outputAmount: 4830n, raw: {} },
      { protocol: 'rhino', outputAmount: 4790n, raw: {} }
    ]

    expect(pickBest(quotes).protocol).toBe('lifi')
  })

  it('keeps the first on a tie', () => {
    const quotes = [
      { protocol: 'velora', outputAmount: 4800n, raw: {} },
      { protocol: 'lifi', outputAmount: 4800n, raw: {} }
    ]

    expect(pickBest(quotes).protocol).toBe('velora')
  })
})

describe('buildNoRouteError', () => {
  it('lists each protocol and its reason under a neutral headline', () => {
    const err = buildNoRouteError({
      fromToken: 'usdt',
      toToken: 'eth',
      network: 'ethereum',
      failures: [
        { protocol: 'velora', reason: 'insufficient funds' },
        { protocol: 'rhinofi', reason: 'apiKey required' }
      ]
    })

    expect(err.message).toContain('Could not get a quote for usdt → eth on ethereum. Tried 2 protocol(s):')
    expect(err.message).toContain('• velora — insufficient funds')
    expect(err.message).toContain('• rhinofi — apiKey required')
  })

  it('names both chains in the cross-network headline', () => {
    const err = buildNoRouteError({
      fromToken: 'usdt',
      toToken: 'eth',
      network: 'ethereum',
      toNetwork: 'base',
      failures: [{ protocol: 'usdt0', reason: 'x' }]
    })

    expect(err.message).toContain('usdt (ethereum) → eth (base)')
  })

  it('falls back to a plain message when there are no failures', () => {
    const err = buildNoRouteError({ fromToken: 'usdt', toToken: 'eth', network: 'ethereum', failures: [] })

    expect(err.message).toBe('Could not get a quote for usdt → eth on ethereum.')
  })
})
