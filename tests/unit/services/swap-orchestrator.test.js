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

import { quoteCandidates, executeCandidates, normalizeQuote } from '../../../src/services/swap-orchestrator.js'

const FROM = { address: '0xUSDT', decimals: 6 }
const TO = { address: '0xETH', decimals: 18 }
const CONTEXT = { fromToken: 'usdt', toToken: 'eth' }

/**
 * Builds a fake protocol class for a kind whose instances answer the kind's
 * quote method with the given behaviour (a quote to return, or an error to
 * throw). The orchestrator instantiates protocols directly with
 * `new ProtocolClass(account, config)`, so the class tracks its construction
 * count to prove per-session instance caching.
 *
 * @param {'swap' | 'bridge' | 'swidge'} kind
 * @param {{ quote?: any, fail?: Error }} behavior
 */
function protocolClass (kind, behavior) {
  const quoteMethod = kind === 'swap' ? 'quoteSwap' : kind === 'bridge' ? 'quoteBridge' : 'quoteSwidge'
  const stats = { constructed: 0, executed: null }
  const Cls = class {
    constructor (account, config) {
      stats.constructed++
      this.account = account
      this.config = config
    }
  }
  Cls.prototype[quoteMethod] = async function () {
    if (behavior.fail) throw behavior.fail
    return behavior.quote
  }
  Cls.prototype[kind] = async function (options) {
    stats.executed = options
    return behavior.executeResult
  }
  Cls.stats = stats
  return Cls
}

const candidate = (name, kind, behavior = {}) => ({ name, kind, ProtocolClass: protocolClass(kind, behavior) })

describe('normalizeQuote', () => {
  it('maps a swap quote to tokenIn/tokenOutAmount', () => {
    const raw = { fee: 10n, tokenInAmount: 100n, tokenOutAmount: 4800n }
    const q = normalizeQuote('swap', 'velora', raw, {})
    expect(q).toEqual({ protocol: 'velora', inputAmount: 100n, outputAmount: 4800n, fees: { gas: 10n }, raw })
  })

  it('uses the input amount for both sides of a bridge (same-token) and keeps both fees', () => {
    const q = normalizeQuote('bridge', 'usdt0', { fee: 5n, bridgeFee: 2n }, { amountIn: 1000n })
    expect(q.inputAmount).toBe(1000n)
    expect(q.outputAmount).toBe(1000n)
    expect(q.fees).toEqual({ gas: 5n, bridge: 2n })
  })

  it('maps a swidge quote to from/toTokenAmount', () => {
    const q = normalizeQuote('swidge', 'rhinofi', { fromTokenAmount: 100n, toTokenAmount: 4700n, fees: [] }, {})
    expect(q.inputAmount).toBe(100n)
    expect(q.outputAmount).toBe(4700n)
  })
})

describe('quoteCandidates', () => {
  it('constructs each candidate with the account and returns the best with no failures', async () => {
    const account = { id: 'acct' }
    const velora = candidate('velora', 'swap', { quote: { fee: 1n, tokenInAmount: 100n, tokenOutAmount: 4700n } })
    const rhinofi = candidate('rhinofi', 'swidge', { quote: { fromTokenAmount: 100n, toTokenAmount: 4830n, fees: [] } })
    const request = { fromToken: FROM, toToken: TO, amountIn: 100n }

    const { quote, failures } = await quoteCandidates({
      account, network: 'ethereum', request, context: CONTEXT, candidates: [velora, rhinofi]
    })

    expect(quote.protocol).toBe('rhinofi')
    expect(quote.outputAmount).toBe(4830n)
    expect(failures).toEqual([])
    expect(velora.ProtocolClass.stats.constructed).toBe(1)
    expect(rhinofi.ProtocolClass.stats.constructed).toBe(1)
  })

  it('returns the surviving winner and reports the failed protocol as skipped', async () => {
    const account = {}
    const request = { fromToken: FROM, toToken: TO, amountIn: 100n }

    const { quote, failures } = await quoteCandidates({
      account,
      network: 'ethereum',
      request,
      context: CONTEXT,
      candidates: [
        candidate('velora', 'swap', { quote: { fee: 1n, tokenInAmount: 100n, tokenOutAmount: 4700n } }),
        candidate('usdt0', 'swap', { fail: new Error('provider down') })
      ]
    })

    expect(quote.protocol).toBe('velora')
    expect(failures).toEqual([{ protocol: 'usdt0', reason: 'provider down' }])
  })

  it('surfaces the underlying error when the only candidate fails', async () => {
    const account = {}
    const request = { fromToken: FROM, toToken: TO, amountIn: 100n }

    await expect(
      quoteCandidates({
        account,
        network: 'ethereum',
        request,
        context: CONTEXT,
        candidates: [candidate('velora', 'swap', { fail: new Error('allowance required') })]
      })
    ).rejects.toThrow('allowance required')
  })

  it('throws a listed-reasons error when several candidates all fail', async () => {
    const account = {}
    const request = { fromToken: FROM, toToken: TO, amountIn: 100n }

    await expect(
      quoteCandidates({
        account,
        network: 'ethereum',
        request,
        context: CONTEXT,
        candidates: [
          candidate('velora', 'swap', { fail: new Error('insufficient funds') }),
          candidate('symbiosis', 'swidge', { fail: new Error("missing 'chain' config") })
        ]
      })
    ).rejects.toThrow(/Tried 2 protocol\(s\):[\s\S]*velora — insufficient funds[\s\S]*symbiosis — missing 'chain' config/)
  })

  it('constructs a protocol once and reuses the instance across quotes', async () => {
    const account = { id: 'same' }
    const velora = candidate('velora', 'swap', { quote: { fee: 1n, tokenInAmount: 100n, tokenOutAmount: 4700n } })
    const request = { fromToken: FROM, toToken: TO, amountIn: 100n }
    const args = { account, network: 'ethereum', request, context: CONTEXT, candidates: [velora] }

    await quoteCandidates(args)
    await quoteCandidates(args)

    expect(velora.ProtocolClass.stats.constructed).toBe(1)
  })
})

describe('executeCandidates', () => {
  it('executes only the winning protocol and returns its result plus skipped', async () => {
    const account = {}
    const velora = candidate('velora', 'swap', {
      quote: { fee: 1n, tokenInAmount: 100n, tokenOutAmount: 4700n },
      executeResult: { hash: '0xabc', tokenInAmount: 100n, tokenOutAmount: 4700n }
    })
    const rhinofi = candidate('rhinofi', 'swidge', { fail: new Error('apiKey required') })
    const request = { fromToken: FROM, toToken: TO, amountIn: 100n }

    const { protocol, result, failures } = await executeCandidates({
      account, network: 'ethereum', request, context: CONTEXT, candidates: [velora, rhinofi]
    })

    expect(protocol).toBe('velora')
    expect(result).toEqual({ hash: '0xabc', tokenInAmount: 100n, tokenOutAmount: 4700n })
    expect(failures).toEqual([{ protocol: 'rhinofi', reason: 'apiKey required' }])
    // the losing protocol is never executed
    expect(rhinofi.ProtocolClass.stats.executed).toBe(null)
  })

  it('does not execute anything when no protocol quotes', async () => {
    const account = {}
    const velora = candidate('velora', 'swap', { fail: new Error('insufficient funds') })
    const usdt0 = candidate('usdt0', 'swap', { fail: new Error('provider down') })
    const request = { fromToken: FROM, toToken: TO, amountIn: 100n }

    await expect(
      executeCandidates({ account, network: 'ethereum', request, context: CONTEXT, candidates: [velora, usdt0] })
    ).rejects.toThrow(/Tried 2 protocol\(s\)/)
    expect(velora.ProtocolClass.stats.executed).toBe(null)
  })
})
