// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { KeyService } from '../../../src/services/key-service.js'
import { WalletKeyring } from '../../../src/security/keyring.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('KeyService', () => {
  let tempDir
  let originalXdg
  let keyService

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wdk-test-'))
    originalXdg = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = tempDir
    keyService = new KeyService(new WalletKeyring())
  })

  afterEach(async () => {
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = originalXdg
    await rm(tempDir, { recursive: true, force: true })
  })

  it('generates a valid 12-word seed phrase', () => {
    const phrase = keyService.generate(12)
    const words = phrase.split(' ')
    expect(words.length).toBe(12)
    expect(keyService.validate(phrase)).toBe(true)
  })

  it('generates a valid 24-word seed phrase', () => {
    const phrase = keyService.generate(24)
    const words = phrase.split(' ')
    expect(words.length).toBe(24)
    expect(keyService.validate(phrase)).toBe(true)
  })

  it('validates correct seed phrases', () => {
    expect(
      keyService.validate(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
      )
    ).toBe(true)
  })

  it('rejects invalid seed phrases', () => {
    expect(keyService.validate('not a valid seed phrase at all')).toBe(false)
    expect(keyService.validate('')).toBe(false)
  })

  it('stores and unlocks seed phrase', async () => {
    const phrase = keyService.generate(12)
    await keyService.store(phrase, 'testpass', 'default')
    expect(await keyService.hasKey('default')).toBe(true)
    const retrieved = await keyService.unlock('testpass', 'default')
    expect(retrieved).toBe(phrase)
  })

  it('throws KeyNotFoundError when no key exists', async () => {
    await expect(keyService.unlock('anypass', 'default')).rejects.toThrow(/No key found/)
  })

  it('throws WrongPasswordError on bad password', async () => {
    const phrase = keyService.generate(12)
    await keyService.store(phrase, 'correctpass', 'default')
    await expect(keyService.unlock('wrongpass', 'default')).rejects.toThrow(/Incorrect passphrase/)
  })

  it('throws InvalidSeedPhraseError for invalid phrases', async () => {
    await expect(
      keyService.store('invalid phrase', 'pass', 'default')
    ).rejects.toThrow(/Invalid seed phrase/)
  })

  it('destroys stored key', async () => {
    const phrase = keyService.generate(12)
    await keyService.store(phrase, 'pass', 'default')
    expect(await keyService.hasKey('default')).toBe(true)
    await keyService.destroy('default')
    expect(await keyService.hasKey('default')).toBe(false)
  })

  it('stores and unlocks with per-wallet passwords', async () => {
    const phrase1 = keyService.generate(12)
    const phrase2 = keyService.generate(12)
    await keyService.store(phrase1, 'pass1', 'wallet-a')
    await keyService.store(phrase2, 'pass2', 'wallet-b')

    expect(await keyService.hasKey('wallet-a')).toBe(true)
    expect(await keyService.hasKey('wallet-b')).toBe(true)

    const retrieved1 = await keyService.unlock('pass1', 'wallet-a')
    const retrieved2 = await keyService.unlock('pass2', 'wallet-b')
    expect(retrieved1).toBe(phrase1)
    expect(retrieved2).toBe(phrase2)

    await expect(keyService.unlock('pass2', 'wallet-a')).rejects.toThrow(/Incorrect passphrase/)
  })

  it('lists wallets', async () => {
    const phrase1 = keyService.generate(12)
    const phrase2 = keyService.generate(12)
    await keyService.store(phrase1, 'pass1', 'default')
    await keyService.store(phrase2, 'pass2', 'trading')
    const wallets = await keyService.list()
    expect(wallets).toContain('default')
    expect(wallets).toContain('trading')
    expect(wallets.length).toBe(2)
  })
})
