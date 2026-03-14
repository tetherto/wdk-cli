import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORKS, NETWORK_NAMES, isEvmNetwork, isBtcNetwork, isSolanaNetwork, isSparkNetwork, isEvmErc4337Network, isValidNetwork, isTestnet, getNetworkConfig, getAllNetworks, getAllNetworkNames, isCustomNetwork, isBuiltinNetwork, getCustomNetworks, saveCustomNetwork, deleteCustomNetwork } from '../../../src/config/networks.js'
import { configService } from '../../../src/services/config-service.js'

describe('networks', () => {
  it('has all expected built-in networks', () => {
    expect(NETWORK_NAMES).toContain('bitcoin')
    expect(NETWORK_NAMES).toContain('bitcoin-testnet3')
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
    expect(NETWORK_NAMES).toContain('spark')
    expect(NETWORK_NAMES).toContain('spark-regtest')
    expect(NETWORK_NAMES).toContain('tron')
    expect(NETWORK_NAMES).toContain('tron-testnet')
    expect(NETWORK_NAMES).toContain('smart-account-ethereum')
    expect(NETWORK_NAMES).toContain('smart-account-sepolia')
    expect(NETWORK_NAMES).toContain('smart-account-polygon')
    expect(NETWORK_NAMES).toContain('smart-account-arbitrum')
    expect(NETWORK_NAMES).toContain('smart-account-plasma')
  })

  it('identifies EVM networks', () => {
    expect(isEvmNetwork('ethereum')).toBe(true)
    expect(isEvmNetwork('sepolia')).toBe(true)
    expect(isEvmNetwork('polygon')).toBe(true)
    expect(isEvmNetwork('bitcoin')).toBe(false)
    expect(isEvmNetwork('bitcoin-testnet3')).toBe(false)
  })

  it('identifies BTC networks', () => {
    expect(isBtcNetwork('bitcoin')).toBe(true)
    expect(isBtcNetwork('bitcoin-testnet3')).toBe(true)
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

  it('identifies Spark networks', () => {
    expect(isSparkNetwork('spark')).toBe(true)
    expect(isSparkNetwork('spark-regtest')).toBe(true)
    expect(isSparkNetwork('ethereum')).toBe(false)
    expect(isSparkNetwork('bitcoin')).toBe(false)
  })

  it('identifies EVM ERC-4337 networks', () => {
    expect(isEvmErc4337Network('smart-account-ethereum')).toBe(true)
    expect(isEvmErc4337Network('smart-account-sepolia')).toBe(true)
    expect(isEvmErc4337Network('ethereum')).toBe(false)
    expect(isEvmErc4337Network('bitcoin')).toBe(false)
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
    expect(isTestnet('bitcoin-testnet3')).toBe(true)
    expect(isTestnet('bitcoin-signet')).toBe(true)
    expect(isTestnet('sepolia')).toBe(true)
    expect(isTestnet('solana-testnet')).toBe(true)
    expect(isTestnet('solana-devnet')).toBe(true)
    expect(isTestnet('spark-regtest')).toBe(true)
    expect(isTestnet('smart-account-sepolia')).toBe(true)
    expect(isTestnet('bitcoin')).toBe(false)
    expect(isTestnet('ethereum')).toBe(false)
    expect(isTestnet('solana')).toBe(false)
    expect(isTestnet('spark')).toBe(false)
    expect(isTestnet('smart-account-ethereum')).toBe(false)
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
      expect(config.type).toMatch(/^wdk-wallet-(evm|btc|solana|spark|evm-erc-4337|tron)$/)
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

  it('isSparkNetwork works with custom spark networks', () => {
    vi.restoreAllMocks()
    vi.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'customNetworks') {
        return { 'spark-custom': { name: 'spark-custom', displayName: 'Spark Custom', type: 'wdk-wallet-spark', nativeSymbol: 'BTC', decimals: 8, custom: true } }
      }
      return undefined
    })
    expect(isSparkNetwork('spark-custom')).toBe(true)
  })

  it('isEvmErc4337Network works with custom ERC-4337 networks', () => {
    vi.restoreAllMocks()
    vi.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'customNetworks') {
        return { 'erc4337-custom': { name: 'erc4337-custom', displayName: 'ERC-4337 Custom', type: 'wdk-wallet-evm-erc-4337', nativeSymbol: 'ETH', decimals: 18, custom: true } }
      }
      return undefined
    })
    expect(isEvmErc4337Network('erc4337-custom')).toBe(true)
  })
})
