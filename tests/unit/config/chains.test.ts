import { describe, it, expect } from 'vitest'
import { CHAINS, CHAIN_NAMES, isEvmChain, isBtcChain, isValidChain, isTestnet, getChainConfig } from '../../../src/config/chains.js'

describe('chains', () => {
  it('has all expected chains', () => {
    expect(CHAIN_NAMES).toContain('bitcoin')
    expect(CHAIN_NAMES).toContain('bitcoin-testnet')
    expect(CHAIN_NAMES).toContain('ethereum')
    expect(CHAIN_NAMES).toContain('sepolia')
    expect(CHAIN_NAMES).toContain('polygon')
    expect(CHAIN_NAMES).toContain('arbitrum')
    expect(CHAIN_NAMES).toContain('bsc')
    expect(CHAIN_NAMES).toContain('avalanche')
  })

  it('identifies EVM chains', () => {
    expect(isEvmChain('ethereum')).toBe(true)
    expect(isEvmChain('sepolia')).toBe(true)
    expect(isEvmChain('polygon')).toBe(true)
    expect(isEvmChain('bitcoin')).toBe(false)
    expect(isEvmChain('bitcoin-testnet')).toBe(false)
  })

  it('identifies BTC chains', () => {
    expect(isBtcChain('bitcoin')).toBe(true)
    expect(isBtcChain('bitcoin-testnet')).toBe(true)
    expect(isBtcChain('ethereum')).toBe(false)
  })

  it('validates chain names', () => {
    expect(isValidChain('ethereum')).toBe(true)
    expect(isValidChain('bitcoin')).toBe(true)
    expect(isValidChain('solana')).toBe(false)
    expect(isValidChain('')).toBe(false)
  })

  it('identifies testnets', () => {
    expect(isTestnet('bitcoin-testnet')).toBe(true)
    expect(isTestnet('sepolia')).toBe(true)
    expect(isTestnet('bitcoin')).toBe(false)
    expect(isTestnet('ethereum')).toBe(false)
  })

  it('returns chain config', () => {
    const eth = getChainConfig('ethereum')
    expect(eth.displayName).toBe('Ethereum')
    expect(eth.nativeSymbol).toBe('ETH')
    expect(eth.decimals).toBe(18)
    expect(eth.type).toBe('evm')
  })

  it('all chains have required fields', () => {
    for (const chain of CHAIN_NAMES) {
      const config = CHAINS[chain]
      expect(config.name).toBe(chain)
      expect(config.displayName).toBeTruthy()
      expect(config.type).toMatch(/^(evm|btc)$/)
      expect(config.defaultProvider).toMatch(/^https:\/\//)
      expect(config.nativeSymbol).toBeTruthy()
      expect(config.decimals).toBeGreaterThan(0)
    }
  })
})
