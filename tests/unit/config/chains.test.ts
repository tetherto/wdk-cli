import { describe, it, expect } from 'vitest'
import { CHAINS, CHAIN_NAMES, isEvmChain, isBtcChain, isSolanaChain, isValidChain, isTestnet, getChainConfig } from '../../../src/config/chains.js'

describe('chains', () => {
  it('has all expected chains', () => {
    expect(CHAIN_NAMES).toContain('bitcoin')
    expect(CHAIN_NAMES).toContain('bitcoin-testnet')
    expect(CHAIN_NAMES).toContain('bitcoin-signet')
    expect(CHAIN_NAMES).toContain('ethereum')
    expect(CHAIN_NAMES).toContain('sepolia')
    expect(CHAIN_NAMES).toContain('polygon')
    expect(CHAIN_NAMES).toContain('arbitrum')
    expect(CHAIN_NAMES).toContain('bsc')
    expect(CHAIN_NAMES).toContain('avalanche')
    expect(CHAIN_NAMES).toContain('solana')
    expect(CHAIN_NAMES).toContain('solana-testnet')
    expect(CHAIN_NAMES).toContain('solana-devnet')
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
    expect(isBtcChain('bitcoin-signet')).toBe(true)
    expect(isBtcChain('ethereum')).toBe(false)
  })

  it('identifies Solana chains', () => {
    expect(isSolanaChain('solana')).toBe(true)
    expect(isSolanaChain('solana-testnet')).toBe(true)
    expect(isSolanaChain('solana-devnet')).toBe(true)
    expect(isSolanaChain('ethereum')).toBe(false)
    expect(isSolanaChain('bitcoin')).toBe(false)
  })

  it('validates chain names', () => {
    expect(isValidChain('ethereum')).toBe(true)
    expect(isValidChain('bitcoin')).toBe(true)
    expect(isValidChain('solana')).toBe(true)
    expect(isValidChain('solana-devnet')).toBe(true)
    expect(isValidChain('unknown-chain')).toBe(false)
    expect(isValidChain('')).toBe(false)
  })

  it('identifies testnets', () => {
    expect(isTestnet('bitcoin-testnet')).toBe(true)
    expect(isTestnet('bitcoin-signet')).toBe(true)
    expect(isTestnet('sepolia')).toBe(true)
    expect(isTestnet('solana-testnet')).toBe(true)
    expect(isTestnet('solana-devnet')).toBe(true)
    expect(isTestnet('bitcoin')).toBe(false)
    expect(isTestnet('ethereum')).toBe(false)
    expect(isTestnet('solana')).toBe(false)
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
      expect(config.type).toMatch(/^(evm|btc|solana)$/)
      expect(config.defaultProvider).toMatch(/^https:\/\//)
      expect(config.nativeSymbol).toBeTruthy()
      expect(config.decimals).toBeGreaterThan(0)
    }
  })
})
