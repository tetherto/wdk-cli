import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { KeyService } from '../../../src/services/key-service.js'
import { Keyring } from '../../../src/security/keyring.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('KeyService', () => {
  let tempDir: string
  let keyService: KeyService

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wdk-test-'))
    const keyring = new Keyring(join(tempDir, 'keyring.enc'))
    keyService = new KeyService(keyring)
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
})
