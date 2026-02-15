import { describe, it, expect } from 'vitest'
import { formatBalance, formatAddress, formatTxHash, formatNetworkLabel } from '../../../src/ui/formatters.js'

describe('formatters', () => {
  describe('formatBalance', () => {
    it('formats ETH balance (18 decimals)', () => {
      const result = formatBalance('1500000000000000000', 'ethereum')
      expect(result).toBe('1.5 ETH')
    })

    it('formats zero balance', () => {
      const result = formatBalance('0', 'ethereum')
      expect(result).toBe('0.0 ETH')
    })

    it('formats BTC balance (8 decimals)', () => {
      const result = formatBalance('50000', 'bitcoin')
      expect(result).toBe('0.0005 BTC')
    })

    it('formats large balance', () => {
      const result = formatBalance('100000000000000000000', 'ethereum')
      expect(result).toBe('100.0 ETH')
    })

    it('handles number input', () => {
      const result = formatBalance(1000000000000000000, 'ethereum')
      expect(result).toContain('ETH')
    })
  })

  describe('formatAddress', () => {
    it('returns full address when not truncating', () => {
      const addr = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      expect(formatAddress(addr)).toBe(addr)
    })

    it('truncates long addresses', () => {
      const addr = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      const result = formatAddress(addr, true)
      expect(result).toMatch(/^0x742d35.*f0bEb0$/)
      expect(result.length).toBeLessThan(addr.length)
    })

    it('does not truncate short addresses', () => {
      const addr = '0x1234567890'
      expect(formatAddress(addr, true)).toBe(addr)
    })
  })

  describe('formatTxHash', () => {
    it('truncates long hashes by default', () => {
      const hash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      const result = formatTxHash(hash)
      expect(result.length).toBeLessThan(hash.length)
      expect(result).toContain('...')
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
