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

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatAmount, formatAddress, formatTxHash, formatNetworkLabel } from '../../../src/ui/formatters.js'

describe('formatters', () => {
  describe('formatAmount', () => {
    it('formats ETH amount (18 decimals)', () => {
      assert.equal(formatAmount(1500000000000000000n, 18, 'ETH'), '1.5 ETH')
    })

    it('formats zero amount', () => {
      assert.equal(formatAmount(0n, 18, 'ETH'), '0 ETH')
    })

    it('formats BTC amount (8 decimals)', () => {
      assert.equal(formatAmount(50000n, 8, 'BTC'), '0.0005 BTC')
    })

    it('formats large amount', () => {
      assert.equal(formatAmount(100000000000000000000n, 18, 'ETH'), '100 ETH')
    })

    it('formats USDT amount (6 decimals)', () => {
      assert.equal(formatAmount(1000000n, 6, 'USDT'), '1 USDT')
    })
  })

  describe('formatAddress', () => {
    it('returns full address when not truncating', () => {
      const addr = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      assert.equal(formatAddress(addr), addr)
    })

    it('truncates long addresses', () => {
      const addr = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      const result = formatAddress(addr, true)
      assert.match(result, /^0x742d35.*f0bEb0$/)
      assert.ok(result.length < addr.length)
    })

    it('does not truncate short addresses', () => {
      const addr = '0x1234567890'
      assert.equal(formatAddress(addr, true), addr)
    })
  })

  describe('formatTxHash', () => {
    it('truncates long hashes by default', () => {
      const hash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      const result = formatTxHash(hash)
      assert.ok(result.length < hash.length)
      assert.ok(result.includes('...'))
    })

    it('returns full hash when not truncating', () => {
      const hash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      assert.equal(formatTxHash(hash, false), hash)
    })
  })

  describe('formatNetworkLabel', () => {
    it('formats network labels', () => {
      assert.equal(formatNetworkLabel('ethereum'), 'Ethereum (ETH)')
      assert.equal(formatNetworkLabel('bitcoin'), 'Bitcoin (BTC)')
      assert.equal(formatNetworkLabel('polygon'), 'Polygon (POL)')
    })
  })
})
