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

import { Keyring } from '../../../src/security/keyring.js'
import { decrypt } from '@tetherto/wdk-utils'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const SEED_PHRASE_2 = 'vacant sword body pistol friend wave broccoli phrase fatigue lottery version toast'
const PASSPHRASE = 'correct-horse'

// Encrypted form of SEED_PHRASE under PASSPHRASE, captured from wdk-utils encrypt().
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

describe('Keyring', () => {
  let tempDir
  let path
  let keyring

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wdk-test-'))
    path = join(tempDir, 'keyring.enc')
    keyring = new Keyring(path)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('retrieves a stored seed phrase', async () => {
    await writeFile(path, JSON.stringify(DUMMY_PAYLOAD))

    expect(await keyring.retrieve(PASSPHRASE)).toBe(SEED_PHRASE)
  })

  it('rejects the wrong passphrase on retrieve', async () => {
    await writeFile(path, JSON.stringify(DUMMY_PAYLOAD))

    await expect(keyring.retrieve('wrong-pass')).rejects.toThrow('aes/gcm: invalid ghash tag')
  })

  it('stores the seed phrase encrypted, with no temp file left behind', async () => {
    await keyring.store(SEED_PHRASE, PASSPHRASE)

    const payload = JSON.parse(await readFile(path, 'utf8'))
    expect(decrypt(payload, PASSPHRASE)).toBe(SEED_PHRASE)
    expect(await readdir(tempDir)).toEqual(['keyring.enc'])
  })

  it('store overwrites an existing seed file', async () => {
    await writeFile(path, JSON.stringify(DUMMY_PAYLOAD))

    await keyring.store(SEED_PHRASE_2, 'new-pass')

    const payload = JSON.parse(await readFile(path, 'utf8'))
    expect(decrypt(payload, 'new-pass')).toBe(SEED_PHRASE_2)
    expect(await readdir(tempDir)).toEqual(['keyring.enc'])
  })

  it('reports exists false when no file', async () => {
    expect(await keyring.exists()).toBe(false)
  })

  it('reports exists true when the seed file is present', async () => {
    await writeFile(path, JSON.stringify(DUMMY_PAYLOAD))

    expect(await keyring.exists()).toBe(true)
  })

  it('destroys the keyring file', async () => {
    await writeFile(path, JSON.stringify(DUMMY_PAYLOAD))

    await keyring.destroy()

    expect(await readdir(tempDir)).toEqual([])
  })

  it('destroy is safe when no file exists', async () => {
    await keyring.destroy()
  })
})
