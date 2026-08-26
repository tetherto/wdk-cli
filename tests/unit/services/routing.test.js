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

import { pickBest, selectBestQuote } from '../../../src/services/routing.js'

const fulfilled = (value) => ({ status: 'fulfilled', value })
const rejected = (reason) => ({ status: 'rejected', reason })

const CONTEXT = { fromToken: 'usdt', toToken: 'eth', network: 'ethereum', checked: 3 }

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

describe('selectBestQuote', () => {
  it('returns the best of the successful quotes, ignoring failures', () => {
    const settled = [
      fulfilled({ protocol: 'velora', outputAmount: 4700n, raw: {} }),
      rejected(new Error('no route')),
      fulfilled({ protocol: 'lifi', outputAmount: 4830n, raw: {} })
    ]

    expect(selectBestQuote(settled, CONTEXT).protocol).toBe('lifi')
  })

  it('ignores fulfilled-but-null results', () => {
    const settled = [
      fulfilled(null),
      fulfilled({ protocol: 'velora', outputAmount: 4700n, raw: {} })
    ]

    expect(selectBestQuote(settled, CONTEXT).protocol).toBe('velora')
  })

  it('raises one aggregate same-network error when nothing succeeds', () => {
    const settled = [rejected(new Error('a')), rejected(new Error('b'))]

    expect(() => selectBestQuote(settled, CONTEXT)).toThrow(
      'No route found for usdt → eth on ethereum. Checked 3 protocol(s).'
    )
  })

  it('names both chains in the cross-network no-route error', () => {
    const settled = [rejected(new Error('a'))]
    const ctx = { fromToken: 'usdt', toToken: 'eth', network: 'ethereum', toNetwork: 'base', checked: 1 }

    expect(() => selectBestQuote(settled, ctx)).toThrow(
      'No route found for usdt (ethereum) → eth (base). Checked 1 protocol(s).'
    )
  })
})
