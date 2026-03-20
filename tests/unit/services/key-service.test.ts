import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { KeyService } from '../../../src/services/key-service.js'
import { WalletKeyring } from '../../../src/security/keyring.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('../../../src/config/constants.js', async () => {
  let testDir = ''
  return {
    DEFAULT_WALLET: 'default',
    getWalletsDir: () => join(testDir, 'wallets'),
    getWalletPath: (name: string = 'default') => join(testDir, 'wallets', `${name}.enc`),
    getKeyringPath: () => join(testDir, 'keyring.enc'),
    setTestDir: (dir: string) => { testDir = dir },
  }
})

describe('KeyService', () => {
  let tempDir: string
  let keyService: KeyService

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wdk-test-'))
    const constants = await import('../../../src/config/constants.js') as { setTestDir: (dir: string) => void }
    constants.setTestDir(tempDir)
    keyService = new KeyService(new WalletKeyring())
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('generates a valid 12-word seed phrase', () => {
    const phrase = keyService.generate(12)
    const words = phrase.split(' ')
    expect(words).toHaveLength(12)
    expect(keyService.validate(phrase)).toBe(true)
  })

  it('generates a valid 24-word seed phrase', () => {
    const phrase = keyService.generate(24)
    const words = phrase.split(' ')
    expect(words).toHaveLength(24)
    expect(keyService.validate(phrase)).toBe(true)
  })

  it('validates correct seed phrases', () => {
    expect(keyService.validate('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')).toBe(true)
  })

  it('rejects invalid seed phrases', () => {
    expect(keyService.validate('not a valid seed phrase at all')).toBe(false)
    expect(keyService.validate('')).toBe(false)
  })

  it('stores and unlocks seed phrase', async () => {
    const phrase = keyService.generate(12)
    await keyService.store(phrase, 'testpass')
    expect(await keyService.hasKey()).toBe(true)
    const retrieved = await keyService.unlock('testpass')
    expect(retrieved).toBe(phrase)
  })

  it('throws KeyNotFoundError when no key exists', async () => {
    await expect(keyService.unlock('anypass')).rejects.toThrow('No key found')
  })

  it('throws WrongPasswordError on bad password', async () => {
    const phrase = keyService.generate(12)
    await keyService.store(phrase, 'correctpass')
    await expect(keyService.unlock('wrongpass')).rejects.toThrow('Incorrect password')
  })

  it('throws InvalidSeedPhraseError for invalid phrases', async () => {
    await expect(keyService.store('invalid phrase', 'pass')).rejects.toThrow('Invalid seed phrase')
  })

  it('destroys stored key', async () => {
    const phrase = keyService.generate(12)
    await keyService.store(phrase, 'pass')
    expect(await keyService.hasKey()).toBe(true)
    await keyService.destroy()
    expect(await keyService.hasKey()).toBe(false)
  })

  it('stores and unlocks named wallet', async () => {
    const phrase = keyService.generate(12)
    await keyService.store(phrase, 'testpass', 'trading')
    expect(await keyService.hasKey('trading')).toBe(true)
    const retrieved = await keyService.unlock('testpass', 'trading')
    expect(retrieved).toBe(phrase)
  })

  it('lists wallets', async () => {
    const phrase1 = keyService.generate(12)
    const phrase2 = keyService.generate(12)
    await keyService.store(phrase1, 'pass', 'default')
    await keyService.store(phrase2, 'pass', 'trading')
    const wallets = await keyService.list()
    expect(wallets).toContain('default')
    expect(wallets).toContain('trading')
    expect(wallets).toHaveLength(2)
  })

  it('unlocks all wallets with one password', async () => {
    const phrase1 = keyService.generate(12)
    const phrase2 = keyService.generate(12)
    await keyService.store(phrase1, 'pass', 'default')
    await keyService.store(phrase2, 'pass', 'savings')
    const seeds = await keyService.unlockAll('pass')
    expect(seeds.size).toBe(2)
    expect(seeds.get('default')).toBe(phrase1)
    expect(seeds.get('savings')).toBe(phrase2)
  })
})
