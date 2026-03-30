import { describe, it, expect } from 'vitest'
import { CONFIG_DEFAULTS } from '../../../src/config/constants.js'

describe('CONFIG_DEFAULTS', () => {
  it('has global defaults', () => {
    expect(CONFIG_DEFAULTS).toHaveProperty('defaultIndex', 0)
    expect(CONFIG_DEFAULTS).toHaveProperty('indexer')
    expect(CONFIG_DEFAULTS).toHaveProperty('output')
  })

  it('has network configs derived from wdk-config.json', () => {
    const networks = CONFIG_DEFAULTS.networks as Record<string, Record<string, unknown>>
    expect(networks).toHaveProperty('bitcoin')
    expect(networks).toHaveProperty('ethereum')
    expect(networks).toHaveProperty('solana')
    expect(networks).toHaveProperty('spark')
    expect(networks).toHaveProperty('tron')
    expect(networks).toHaveProperty('smart-account-ethereum')
  })

  it('bitcoin config has expected fields', () => {
    const networks = CONFIG_DEFAULTS.networks as Record<string, Record<string, unknown>>
    expect(networks.bitcoin.host).toBe('electrum.blockstream.info')
    expect(networks.bitcoin.port).toBe(50001)
    expect(networks.bitcoin.bip).toBe(84)
  })

  it('ethereum config has expected fields', () => {
    const networks = CONFIG_DEFAULTS.networks as Record<string, Record<string, unknown>>
    expect(networks.ethereum.provider).toBe('https://ethereum-rpc.publicnode.com')
    expect(networks.ethereum.transferMaxFee).toBe(5000000000000000)
  })

  it('smart-account config has all ERC-4337 fields', () => {
    const networks = CONFIG_DEFAULTS.networks as Record<string, Record<string, unknown>>
    const sa = networks['smart-account-ethereum']
    expect(sa.chainId).toBe(1)
    expect(sa.provider).toBeTruthy()
    expect(sa.bundlerUrl).toBeTruthy()
    expect(sa.entryPointAddress).toBeTruthy()
    expect(sa.paymasterUrl).toBeTruthy()
    expect(sa.paymasterAddress).toBeTruthy()
    expect(sa.paymasterToken).toBeTruthy()
  })

  it('solana config has provider', () => {
    const networks = CONFIG_DEFAULTS.networks as Record<string, Record<string, unknown>>
    expect(networks.solana.rpcUrl).toBe('https://api.mainnet-beta.solana.com')
  })

  it('spark config has sparkNetwork', () => {
    const networks = CONFIG_DEFAULTS.networks as Record<string, Record<string, unknown>>
    expect(networks.spark.network).toBe('MAINNET')
  })
})
