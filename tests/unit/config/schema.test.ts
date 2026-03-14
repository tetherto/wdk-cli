import { describe, it, expect } from 'vitest'
import { CONFIG_SCHEMAS, getVisibleFields, getMissingFields, validateKey, isFieldRequired } from '../../../src/config/schema.js'

describe('CONFIG_SCHEMAS', () => {
  it('has schemas for all network types', () => {
    expect(CONFIG_SCHEMAS).toHaveProperty('wdk-wallet-btc')
    expect(CONFIG_SCHEMAS).toHaveProperty('wdk-wallet-evm')
    expect(CONFIG_SCHEMAS).toHaveProperty('wdk-wallet-solana')
    expect(CONFIG_SCHEMAS).toHaveProperty('wdk-wallet-spark')
    expect(CONFIG_SCHEMAS).toHaveProperty('wdk-wallet-evm-erc-4337')
    expect(CONFIG_SCHEMAS).toHaveProperty('wdk-wallet-tron')
  })
})

describe('getVisibleFields', () => {
  it('returns all fields for types without conditions', () => {
    const fields = getVisibleFields('wdk-wallet-evm')
    expect(fields.map(f => f.key)).toEqual(['provider', 'transferMaxFee'])
  })

  it('returns all BTC fields', () => {
    const fields = getVisibleFields('wdk-wallet-btc')
    expect(fields.map(f => f.key)).toContain('host')
    expect(fields.map(f => f.key)).toContain('port')
  })

  it('shows paymasterToken fields in paymasterToken mode', () => {
    const fields = getVisibleFields('wdk-wallet-evm-erc-4337', { mode: 'paymasterToken' })
    const keys = fields.map(f => f.key)
    expect(keys).toContain('paymasterToken')
    expect(keys).toContain('paymasterAddress')
    expect(keys).toContain('paymasterUrl')
    expect(keys).not.toContain('sponsorshipPolicyId')
    expect(keys).not.toContain('isSponsored')
    expect(keys).not.toContain('useNativeCoins')
  })

  it('shows sponsored fields in sponsored mode', () => {
    const fields = getVisibleFields('wdk-wallet-evm-erc-4337', { mode: 'sponsored' })
    const keys = fields.map(f => f.key)
    expect(keys).toContain('sponsorshipPolicyId')
    expect(keys).toContain('paymasterUrl')
    expect(keys).not.toContain('paymasterToken')
    expect(keys).not.toContain('paymasterAddress')
    expect(keys).not.toContain('transferMaxFee')
  })

  it('shows nativeCoins fields in nativeCoins mode', () => {
    const fields = getVisibleFields('wdk-wallet-evm-erc-4337', { mode: 'nativeCoins' })
    const keys = fields.map(f => f.key)
    expect(keys).toContain('transferMaxFee')
    expect(keys).not.toContain('paymasterToken')
    expect(keys).not.toContain('paymasterAddress')
    expect(keys).not.toContain('paymasterUrl')
    expect(keys).not.toContain('sponsorshipPolicyId')
  })

  it('hides isSponsored and useNativeCoins in all modes', () => {
    for (const mode of ['paymasterToken', 'sponsored', 'nativeCoins']) {
      const fields = getVisibleFields('wdk-wallet-evm-erc-4337', { mode })
      const keys = fields.map(f => f.key)
      expect(keys).not.toContain('isSponsored')
      expect(keys).not.toContain('useNativeCoins')
    }
  })
})

describe('getMissingFields', () => {
  it('returns missing required fields', () => {
    const missing = getMissingFields('wdk-wallet-evm', { provider: '' })
    expect(missing.map(f => f.key)).toContain('provider')
  })

  it('returns empty for fully configured network', () => {
    const missing = getMissingFields('wdk-wallet-evm', { provider: 'https://eth.drpc.org' })
    expect(missing).toHaveLength(0)
  })

  it('returns mode-specific missing fields for ERC-4337', () => {
    const missing = getMissingFields('wdk-wallet-evm-erc-4337', {
      chainId: 1,
      provider: 'https://eth.drpc.org',
      bundlerUrl: 'https://bundler.example.com',
      entryPointAddress: '0x000',
      safeModulesVersion: '0.3.0',
      mode: 'sponsored',
      paymasterUrl: 'https://paymaster.example.com',
    })
    expect(missing).toHaveLength(0)
  })

  it('detects missing paymasterUrl in sponsored mode', () => {
    const missing = getMissingFields('wdk-wallet-evm-erc-4337', {
      chainId: 1,
      provider: 'https://eth.drpc.org',
      bundlerUrl: 'https://bundler.example.com',
      entryPointAddress: '0x000',
      safeModulesVersion: '0.3.0',
      mode: 'sponsored',
    })
    expect(missing.map(f => f.key)).toContain('paymasterUrl')
  })
})

describe('validateKey', () => {
  it('returns null for valid key without type', () => {
    expect(validateKey('provider', 'https://eth.drpc.org')).toBeNull()
  })

  it('rejects unknown keys for a network type', () => {
    const error = validateKey('unknownKey', 'value', 'wdk-wallet-evm')
    expect(error).toContain('Unknown config key')
  })

  it('validates enum options', () => {
    const error = validateKey('mode', 'invalid', 'wdk-wallet-evm-erc-4337')
    expect(error).toContain('Invalid value')
  })

  it('accepts valid enum value', () => {
    expect(validateKey('mode', 'sponsored', 'wdk-wallet-evm-erc-4337')).toBeNull()
  })

  it('validates number type', () => {
    const error = validateKey('chainId', 'not-a-number', 'wdk-wallet-evm-erc-4337')
    expect(error).toContain('must be a number')
  })

  it('accepts valid number', () => {
    expect(validateKey('chainId', '1', 'wdk-wallet-evm-erc-4337')).toBeNull()
  })
})

describe('isFieldRequired', () => {
  it('returns true for static required', () => {
    const field = { key: 'provider', description: 'test', required: true }
    expect(isFieldRequired(field, {})).toBe(true)
  })

  it('evaluates function required', () => {
    const field = { key: 'paymasterUrl', description: 'test', required: (c: Record<string, unknown>) => c.mode !== 'nativeCoins' }
    expect(isFieldRequired(field, { mode: 'sponsored' })).toBe(true)
    expect(isFieldRequired(field, { mode: 'nativeCoins' })).toBe(false)
  })
})
