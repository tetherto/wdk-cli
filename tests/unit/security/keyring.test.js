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

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Keyring } from '../../../src/security/keyring.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Keyring', () => {
  let tempDir
  let keyring

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'wdk-test-'))
    keyring = new Keyring(join(tempDir, 'keyring.enc'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('stores and retrieves a seed phrase', async () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    await keyring.store(phrase, 'password123')
    assert.equal(await keyring.exists(), true)
    const retrieved = await keyring.retrieve('password123')
    assert.equal(retrieved, phrase)
  })

  it('rejects wrong password on retrieve', async () => {
    await keyring.store('test phrase', 'correctpass')
    await assert.rejects(keyring.retrieve('wrongpass'))
  })

  it('reports exists false when no file', async () => {
    assert.equal(await keyring.exists(), false)
  })

  it('destroys the keyring file', async () => {
    await keyring.store('phrase', 'pass')
    assert.equal(await keyring.exists(), true)
    await keyring.destroy()
    assert.equal(await keyring.exists(), false)
  })

  it('destroy is safe when no file exists', async () => {
    await keyring.destroy()
  })
})
