import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WalletRegistry } from '../../../src/services/wallet-registry.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('WalletRegistry', () => {
  let tempDir: string
  let registry: WalletRegistry

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wdk-test-'))
    registry = new WalletRegistry(join(tempDir, 'wallets.json'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('adds and lists wallets', async () => {
    await registry.add({ chain: 'ethereum', index: 0, address: '0x1234' })
    const list = await registry.list()
    expect(list).toHaveLength(1)
    expect(list[0].chain).toBe('ethereum')
    expect(list[0].address).toBe('0x1234')
    expect(list[0].createdAt).toBeTruthy()
  })

  it('deduplicates by chain+index', async () => {
    await registry.add({ chain: 'ethereum', index: 0, address: '0x1234' })
    await registry.add({ chain: 'ethereum', index: 0, address: '0x1234' })
    const list = await registry.list()
    expect(list).toHaveLength(1)
  })

  it('filters by chain', async () => {
    await registry.add({ chain: 'ethereum', index: 0, address: '0x1234' })
    await registry.add({ chain: 'bitcoin', index: 0, address: 'bc1q...' })
    expect(await registry.list('ethereum')).toHaveLength(1)
    expect(await registry.list('bitcoin')).toHaveLength(1)
  })

  it('finds by chain and index', async () => {
    await registry.add({ chain: 'ethereum', index: 0, address: '0x1234' })
    const found = await registry.find('ethereum', 0)
    expect(found?.address).toBe('0x1234')
    const notFound = await registry.find('ethereum', 1)
    expect(notFound).toBeUndefined()
  })

  it('returns empty list when no file exists', async () => {
    const list = await registry.list()
    expect(list).toHaveLength(0)
  })
})
