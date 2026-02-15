import { describe, it, expect } from 'vitest'
import { NETWORKS, NETWORK_NAMES, isEvmNetwork, isBtcNetwork, isSolanaNetwork, isValidNetwork, isTestnet, getNetworkConfig } from '../../../src/config/networks.js'

describe('networks', () => {
  it('has all expected networks', () => {
    expect(NETWORK_NAMES).toContain('bitcoin')
    expect(NETWORK_NAMES).toContain('bitcoin-testnet')
    expect(NETWORK_NAMES).toContain('bitcoin-signet')
    expect(NETWORK_NAMES).toContain('ethereum')
    expect(NETWORK_NAMES).toContain('sepolia')
    expect(NETWORK_NAMES).toContain('polygon')
    expect(NETWORK_NAMES).toContain('arbitrum')
    expect(NETWORK_NAMES).toContain('bsc')
    expect(NETWORK_NAMES).toContain('avalanche')
    expect(NETWORK_NAMES).toContain('solana')
    expect(NETWORK_NAMES).toContain('solana-testnet')
    expect(NETWORK_NAMES).toContain('solana-devnet')
  })

  it('identifies EVM networks', () => {
    expect(isEvmNetwork('ethereum')).toBe(true)
    expect(isEvmNetwork('sepolia')).toBe(true)
    expect(isEvmNetwork('polygon')).toBe(true)
    expect(isEvmNetwork('bitcoin')).toBe(false)
    expect(isEvmNetwork('bitcoin-testnet')).toBe(false)
  })

  it('identifies BTC networks', () => {
    expect(isBtcNetwork('bitcoin')).toBe(true)
    expect(isBtcNetwork('bitcoin-testnet')).toBe(true)
    expect(isBtcNetwork('bitcoin-signet')).toBe(true)
    expect(isBtcNetwork('ethereum')).toBe(false)
  })

  it('identifies Solana networks', () => {
    expect(isSolanaNetwork('solana')).toBe(true)
    expect(isSolanaNetwork('solana-testnet')).toBe(true)
    expect(isSolanaNetwork('solana-devnet')).toBe(true)
    expect(isSolanaNetwork('ethereum')).toBe(false)
    expect(isSolanaNetwork('bitcoin')).toBe(false)
  })

  it('validates network names', () => {
    expect(isValidNetwork('ethereum')).toBe(true)
    expect(isValidNetwork('bitcoin')).toBe(true)
    expect(isValidNetwork('solana')).toBe(true)
    expect(isValidNetwork('solana-devnet')).toBe(true)
    expect(isValidNetwork('unknown-network')).toBe(false)
    expect(isValidNetwork('')).toBe(false)
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

  it('returns network config', () => {
    const eth = getNetworkConfig('ethereum')
    expect(eth.displayName).toBe('Ethereum')
    expect(eth.nativeSymbol).toBe('ETH')
    expect(eth.decimals).toBe(18)
    expect(eth.type).toBe('evm')
  })

  it('all networks have required fields', () => {
    for (const network of NETWORK_NAMES) {
      const config = NETWORKS[network]
      expect(config.name).toBe(network)
      expect(config.displayName).toBeTruthy()
      expect(config.type).toMatch(/^(evm|btc|solana)$/)
      expect(config.defaultProvider).toMatch(/^https:\/\//)
      expect(config.nativeSymbol).toBeTruthy()
      expect(config.decimals).toBeGreaterThan(0)
    }
  })
})
