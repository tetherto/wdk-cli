import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transformConfig } from '../../../src/services/wdk-service.js'
import { configService } from '../../../src/services/config-service.js'

describe('transformConfig', () => {
  beforeEach(() => {
    vi.spyOn(configService, 'getProviderUrl').mockReturnValue('https://mock-provider.com')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('removes empty string values', () => {
    const result = transformConfig('wdk-wallet-btc', {
      host: 'electrum.blockstream.info',
      port: 50001,
      transferMaxFee: '',
      network: 'bitcoin',
    }, 'bitcoin')

    expect(result).not.toHaveProperty('transferMaxFee')
    expect(result.host).toBe('electrum.blockstream.info')
  })

  it('converts transferMaxFee to BigInt', () => {
    const result = transformConfig('wdk-wallet-evm', {
      provider: 'https://eth.drpc.org',
      transferMaxFee: '1000000',
    }, 'ethereum')

    expect(result.transferMaxFee).toBe(BigInt('1000000'))
  })

  it('wraps paymasterToken string into { address } object', () => {
    const result = transformConfig('wdk-wallet-evm-erc-4337', {
      chainId: 1,
      provider: 'https://eth.drpc.org',
      paymasterToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    }, 'smart-account-ethereum')

    expect(result.paymasterToken).toEqual({ address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' })
  })

  it('does not wrap paymasterToken if already an object', () => {
    const tokenObj = { address: '0xabc' }
    const result = transformConfig('wdk-wallet-evm-erc-4337', {
      chainId: 1,
      provider: 'https://eth.drpc.org',
      paymasterToken: tokenObj,
    }, 'smart-account-ethereum')

    expect(result.paymasterToken).toEqual({ address: '0xabc' })
  })

  it('renames provider to rpcUrl for Solana', () => {
    const result = transformConfig('wdk-wallet-solana', {
      provider: 'https://api.mainnet-beta.solana.com',
    }, 'solana')

    expect(result.rpcUrl).toBe('https://mock-provider.com')
    expect(result).not.toHaveProperty('provider')
  })

  it('renames sparkNetwork to network for Spark', () => {
    const result = transformConfig('wdk-wallet-spark', {
      sparkNetwork: 'MAINNET',
    }, 'spark')

    expect(result.network).toBe('MAINNET')
    expect(result).not.toHaveProperty('sparkNetwork')
  })

  it('resolves provider URL for EVM networks', () => {
    const result = transformConfig('wdk-wallet-evm', {
      provider: 'https://eth.drpc.org',
    }, 'ethereum')

    expect(result.provider).toBe('https://mock-provider.com')
  })

  it('resolves provider URL for ERC-4337 networks', () => {
    const result = transformConfig('wdk-wallet-evm-erc-4337', {
      chainId: 11155111,
      provider: 'https://sepolia.drpc.org',
      bundlerUrl: 'https://bundler.example.com',
    }, 'smart-account-sepolia')

    expect(result.provider).toBe('https://mock-provider.com')
    expect(result.bundlerUrl).toBe('https://bundler.example.com')
  })

  it('passes through unknown fields unchanged', () => {
    const result = transformConfig('wdk-wallet-evm-erc-4337', {
      chainId: 1,
      provider: 'https://eth.drpc.org',
      isSponsored: true,
      sponsorshipPolicyId: 'policy-123',
      useNativeCoins: false,
      mode: 'sponsored',
    }, 'smart-account-ethereum')

    expect(result.isSponsored).toBe(true)
    expect(result.sponsorshipPolicyId).toBe('policy-123')
    expect(result.useNativeCoins).toBeUndefined()
  })

  it('removes empty sponsorshipPolicyId but keeps boolean false', () => {
    const result = transformConfig('wdk-wallet-evm-erc-4337', {
      chainId: 1,
      provider: 'https://eth.drpc.org',
      isSponsored: false,
      sponsorshipPolicyId: '',
      useNativeCoins: false,
    }, 'smart-account-ethereum')

    expect(result).not.toHaveProperty('sponsorshipPolicyId')
  })

  it('strips mode field and sets isSponsored for sponsored mode', () => {
    const result = transformConfig('wdk-wallet-evm-erc-4337', {
      chainId: 1,
      provider: 'https://eth.drpc.org',
      bundlerUrl: 'https://bundler.example.com',
      paymasterUrl: 'https://paymaster.example.com',
      paymasterAddress: '0xabc',
      paymasterToken: '0xdef',
      mode: 'sponsored',
      isSponsored: false,
      useNativeCoins: false,
      sponsorshipPolicyId: 'policy-123',
    }, 'smart-account-ethereum')

    expect(result.mode).toBeUndefined()
    expect(result.isSponsored).toBe(true)
    expect(result.paymasterToken).toBeUndefined()
    expect(result.paymasterAddress).toBeUndefined()
    expect(result.sponsorshipPolicyId).toBe('policy-123')
    expect(result.paymasterUrl).toBe('https://paymaster.example.com')
  })

  it('strips mode field and sets useNativeCoins for nativeCoins mode', () => {
    const result = transformConfig('wdk-wallet-evm-erc-4337', {
      chainId: 1,
      provider: 'https://eth.drpc.org',
      bundlerUrl: 'https://bundler.example.com',
      paymasterUrl: 'https://paymaster.example.com',
      paymasterAddress: '0xabc',
      paymasterToken: '0xdef',
      mode: 'nativeCoins',
      isSponsored: false,
      useNativeCoins: false,
      transferMaxFee: '1000000',
    }, 'smart-account-ethereum')

    expect(result.mode).toBeUndefined()
    expect(result.useNativeCoins).toBe(true)
    expect(result.isSponsored).toBeUndefined()
    expect(result.paymasterToken).toBeUndefined()
    expect(result.paymasterAddress).toBeUndefined()
    expect(result.paymasterUrl).toBeUndefined()
    expect(result.sponsorshipPolicyId).toBeUndefined()
    expect(result.transferMaxFee).toBe(BigInt('1000000'))
  })

  it('strips mode field and keeps paymasterToken fields for paymasterToken mode', () => {
    const result = transformConfig('wdk-wallet-evm-erc-4337', {
      chainId: 1,
      provider: 'https://eth.drpc.org',
      bundlerUrl: 'https://bundler.example.com',
      paymasterUrl: 'https://paymaster.example.com',
      paymasterAddress: '0xabc',
      paymasterToken: '0xdef',
      mode: 'paymasterToken',
      isSponsored: false,
      useNativeCoins: false,
      sponsorshipPolicyId: 'policy-123',
    }, 'smart-account-ethereum')

    expect(result.mode).toBeUndefined()
    expect(result.isSponsored).toBeUndefined()
    expect(result.useNativeCoins).toBeUndefined()
    expect(result.sponsorshipPolicyId).toBeUndefined()
    expect(result.paymasterToken).toEqual({ address: '0xdef' })
    expect(result.paymasterAddress).toBe('0xabc')
    expect(result.paymasterUrl).toBe('https://paymaster.example.com')
  })

  it('defaults to paymasterToken mode when mode is not set', () => {
    const result = transformConfig('wdk-wallet-evm-erc-4337', {
      chainId: 1,
      provider: 'https://eth.drpc.org',
      bundlerUrl: 'https://bundler.example.com',
      paymasterUrl: 'https://paymaster.example.com',
      paymasterAddress: '0xabc',
      paymasterToken: '0xdef',
    }, 'smart-account-ethereum')

    expect(result.mode).toBeUndefined()
    expect(result.isSponsored).toBeUndefined()
    expect(result.useNativeCoins).toBeUndefined()
    expect(result.paymasterToken).toEqual({ address: '0xdef' })
  })

  it('does not mutate the input object', () => {
    const input = {
      provider: 'https://eth.drpc.org',
      transferMaxFee: '500',
    }
    const inputCopy = { ...input }
    transformConfig('wdk-wallet-evm', input, 'ethereum')

    expect(input).toEqual(inputCopy)
  })
})
