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
  formatAmount,
  formatAddress,
  formatTxHash,
  formatNetworkLabel
} from '../../../src/ui/formatters.js'

describe('formatters', () => {
  describe('formatAmount', () => {
    it('formats ETH amount (18 decimals)', () => {
      expect(formatAmount(1500000000000000000n, 18, 'ETH')).toBe('1.5 ETH')
    })

    it('formats zero amount', () => {
      expect(formatAmount(0n, 18, 'ETH')).toBe('0 ETH')
    })

    it('formats BTC amount (8 decimals)', () => {
      expect(formatAmount(50000n, 8, 'BTC')).toBe('0.0005 BTC')
    })

    it('formats large amount', () => {
      expect(formatAmount(100000000000000000000n, 18, 'ETH')).toBe('100 ETH')
    })

    it('formats USDT amount (6 decimals)', () => {
      expect(formatAmount(1000000n, 6, 'USDT')).toBe('1 USDT')
    })

    it('trims trailing zeros from the fraction', () => {
      expect(formatAmount(1100000000000000000n, 18, 'ETH')).toBe('1.1 ETH')
    })

    it('caps the fraction at 8 digits', () => {
      expect(formatAmount(1234567890123456789n, 18, 'ETH')).toBe('1.23456789 ETH')
    })
  })

  describe('formatAddress', () => {
    it('returns full address when not truncating', () => {
      const addr = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      expect(formatAddress(addr)).toBe(addr)
    })

    it('truncates long addresses', () => {
      const addr = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      expect(formatAddress(addr, true)).toBe('0x742d35...f0bEb0')
    })

    it('does not truncate short addresses', () => {
      const addr = '0x1234567890'
      expect(formatAddress(addr, true)).toBe(addr)
    })
  })

  describe('formatTxHash', () => {
    it('truncates long hashes by default', () => {
      const hash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      expect(formatTxHash(hash)).toBe('0xabcdef12...34567890')
    })

    it('returns full hash when not truncating', () => {
      const hash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      expect(formatTxHash(hash, false)).toBe(hash)
    })
  })

  describe('formatNetworkLabel', () => {
    it('formats network labels', () => {
      expect(formatNetworkLabel('ethereum')).toBe('Ethereum (ETH)')
      expect(formatNetworkLabel('bitcoin')).toBe('Bitcoin (BTC)')
      expect(formatNetworkLabel('polygon')).toBe('Polygon (POL)')
    })
  })
})
