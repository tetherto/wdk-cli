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
import { decrypt } from '@tetherto/wdk-utils'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const SEED_PHRASE_2 = 'vacant sword body pistol friend wave broccoli phrase fatigue lottery version toast'
const PASSPHRASE = 'correct-horse'
const PASSPHRASE_2 = 'passphrase-two'

// Encrypted forms of the seed phrases, captured from wdk-utils encrypt().
const DUMMY_PAYLOAD = {
  version: 1,
  salt: '3226bca1932f1304dc8e1d020c1cd1da0ef08cd2220874bfc68f573abd398d65',
  iv: '8bf7ece744471e75b8c8a5ff',
  tag: '70b08a526b0d3002e9c6aeb1d53f0310',
  ciphertext: '66c7ac7fc3adc2bf15bfd882fb620a5a2bf4cb7d892572b5aa4a3688431bccf2f98915acc047de6ad18dc5a1dbb142e068e0b341ab90e78aceed602090353e7428ecd89ff1d3610cd6',
  scryptN: 65536,
  scryptR: 8,
  scryptP: 1
}
const DUMMY_PAYLOAD_2 = {
  version: 1,
  salt: 'cd7da54689d1bdbcc1924d6b6729c7bfcd7edbe2934b74fb7cbc47d6353aa08f',
  iv: '259fa8b11f3d4aa06cc896e4',
  tag: '3f357e47fa0e37d91ad0fc59f525776b',
  ciphertext: '3de4b79ee7ee41f6680b45620478bfe1af85f81934eb609c1b67ef62b88a90521692af14803969365ab10ed19bd81f0675f41e84db3d2e32b04ded91185b8c6fd35e30429c95e2300e549181146c34a6ae2e',
  scryptN: 65536,
  scryptR: 8,
  scryptP: 1
}

describe('KeyService', () => {
  let tempDir
  let originalXdg
  let keyService

  function walletPath (name) {
    return join(tempDir, 'wdk-cli', 'wallets', name, 'seed.enc')
  }

  async function writeWalletFixture (name, payload = DUMMY_PAYLOAD) {
    const path = walletPath(name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(payload))
  }

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

  it('generates a 12-word seed phrase', () => {
    expect(keyService.generate(12).split(' ').length).toBe(12)
  })

  it('generates a 24-word seed phrase', () => {
    expect(keyService.generate(24).split(' ').length).toBe(24)
  })

  it('validates correct seed phrases', () => {
    expect(keyService.validate(SEED_PHRASE)).toBe(true)
  })

  it('rejects invalid seed phrases', () => {
    expect(keyService.validate('not a valid seed phrase at all')).toBe(false)
    expect(keyService.validate('')).toBe(false)
  })

  it('stores the seed phrase encrypted on disk', async () => {
    await keyService.store(SEED_PHRASE, PASSPHRASE, 'default')

    const payload = JSON.parse(await readFile(walletPath('default'), 'utf8'))
    expect(decrypt(payload, PASSPHRASE)).toBe(SEED_PHRASE)
  })

  it('re-encrypts the seed with a new passphrase on store', async () => {
    await writeWalletFixture('default')

    await keyService.store(SEED_PHRASE, 'new-pass', 'default')

    const payload = JSON.parse(await readFile(walletPath('default'), 'utf8'))
    expect(decrypt(payload, 'new-pass')).toBe(SEED_PHRASE)
    expect(() => decrypt(payload, PASSPHRASE)).toThrow('aes/gcm: invalid ghash tag')
  })

  it('throws InvalidSeedPhraseError for invalid phrases', async () => {
    await expect(
      keyService.store('invalid phrase', PASSPHRASE, 'default')
    ).rejects.toThrow('Invalid seed phrase. Must be 12 or 24 BIP-39 words.')
  })

  it('unlocks a stored seed phrase', async () => {
    await writeWalletFixture('default')

    expect(await keyService.unlock(PASSPHRASE, 'default')).toBe(SEED_PHRASE)
  })

  it('throws KeyNotFoundError when no key exists', async () => {
    await expect(keyService.unlock('anypass', 'default')).rejects.toThrow('No key found.')
  })

  it('throws WrongPasswordError on bad password', async () => {
    await writeWalletFixture('default')

    await expect(keyService.unlock('wrong-pass', 'default')).rejects.toThrow('Incorrect passphrase.')
  })

  it('unlocks each wallet with its own passphrase', async () => {
    await writeWalletFixture('wallet-a', DUMMY_PAYLOAD)
    await writeWalletFixture('wallet-b', DUMMY_PAYLOAD_2)

    expect(await keyService.unlock(PASSPHRASE, 'wallet-a')).toBe(SEED_PHRASE)
    expect(await keyService.unlock(PASSPHRASE_2, 'wallet-b')).toBe(SEED_PHRASE_2)
    await expect(keyService.unlock(PASSPHRASE_2, 'wallet-a')).rejects.toThrow('Incorrect passphrase.')
  })

  it('reports hasKey false when no wallet exists', async () => {
    expect(await keyService.hasKey('default')).toBe(false)
  })

  it('reports hasKey true when the wallet exists', async () => {
    await writeWalletFixture('default')

    expect(await keyService.hasKey('default')).toBe(true)
  })

  it('destroys the stored key', async () => {
    await writeWalletFixture('default')

    await keyService.destroy('default')

    await expect(access(walletPath('default'))).rejects.toThrow(/ENOENT/)
  })

  it('lists wallets', async () => {
    await writeWalletFixture('default')
    await writeWalletFixture('trading', DUMMY_PAYLOAD_2)

    expect(await keyService.list()).toEqual(['default', 'trading'])
  })
})
