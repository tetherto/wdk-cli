import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORKS, NETWORK_NAMES, isEvmNetwork, isBtcNetwork, isSolanaNetwork, isValidNetwork, isTestnet, getNetworkConfig, getAllNetworks, getAllNetworkNames, isCustomNetwork, isBuiltinNetwork, getCustomNetworks, saveCustomNetwork, deleteCustomNetwork } from '../../../src/config/networks.js'
import { configService } from '../../../src/services/config-service.js'

describe('networks', () => {
  it('has all expected built-in networks', () => {
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
    expect(eth.type).toBe('wdk-wallet-evm')
  })

  it('all built-in networks have required fields', () => {
    for (const network of NETWORK_NAMES) {
      const config = NETWORKS[network]
      expect(config.name).toBe(network)
      expect(config.displayName).toBeTruthy()
      expect(config.type).toMatch(/^wdk-wallet-(evm|btc|solana)$/)
      expect(config.nativeSymbol).toBeTruthy()
      expect(config.decimals).toBeGreaterThan(0)
    }
  })

  it('identifies built-in networks', () => {
    expect(isBuiltinNetwork('ethereum')).toBe(true)
    expect(isBuiltinNetwork('bitcoin')).toBe(true)
    expect(isBuiltinNetwork('nonexistent')).toBe(false)
  })
})

describe('custom networks', () => {
  const mockCustomNetwork = {
    name: 'base',
    displayName: 'Base Mainnet',
    type: 'wdk-wallet-evm' as const,
    nativeSymbol: 'ETH',
    decimals: 18,
    custom: true,
    testnet: false,
    providerUrl: 'https://mainnet.base.org',
  }

  beforeEach(() => {
    vi.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'customNetworks') {
        return { base: mockCustomNetwork }
      }
      return undefined
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns custom networks from config', () => {
    const custom = getCustomNetworks()
    expect(custom).toHaveProperty('base')
    expect(custom.base.displayName).toBe('Base Mainnet')
    expect(custom.base.custom).toBe(true)
  })

  it('getAllNetworks merges built-in and custom', () => {
    const all = getAllNetworks()
    expect(all).toHaveProperty('ethereum')
    expect(all).toHaveProperty('base')
  })

  it('getAllNetworkNames includes custom networks', () => {
    const names = getAllNetworkNames()
    expect(names).toContain('ethereum')
    expect(names).toContain('base')
  })

  it('isValidNetwork accepts custom networks', () => {
    expect(isValidNetwork('base')).toBe(true)
    expect(isValidNetwork('nonexistent')).toBe(false)
  })

  it('isCustomNetwork identifies custom networks', () => {
    expect(isCustomNetwork('base')).toBe(true)
    expect(isCustomNetwork('ethereum')).toBe(false)
  })

  it('getNetworkConfig returns custom network config', () => {
    const config = getNetworkConfig('base')
    expect(config.displayName).toBe('Base Mainnet')
    expect(config.type).toBe('wdk-wallet-evm')
    expect(config.custom).toBe(true)
  })

  it('isEvmNetwork works with custom networks', () => {
    expect(isEvmNetwork('base')).toBe(true)
  })

  it('isTestnet works with custom networks', () => {
    expect(isTestnet('base')).toBe(false)

    vi.restoreAllMocks()
    vi.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'customNetworks') {
        return { 'base-testnet': { ...mockCustomNetwork, name: 'base-testnet', testnet: true } }
      }
      return undefined
    })

    expect(isTestnet('base-testnet')).toBe(true)
  })

  it('saveCustomNetwork stores to config', () => {
    const setSpy = vi.spyOn(configService, 'set').mockImplementation(() => {})
    saveCustomNetwork('optimism', mockCustomNetwork)
    expect(setSpy).toHaveBeenCalledWith('customNetworks.optimism', mockCustomNetwork)
  })

  it('deleteCustomNetwork removes from config', () => {
    const deleteSpy = vi.spyOn(configService, 'delete').mockImplementation(() => {})
    deleteCustomNetwork('base')
    expect(deleteSpy).toHaveBeenCalledWith('customNetworks.base')
  })

  it('returns empty object when no custom networks exist', () => {
    vi.restoreAllMocks()
    vi.spyOn(configService, 'get').mockReturnValue(undefined)
    const custom = getCustomNetworks()
    expect(custom).toEqual({})
  })
})
