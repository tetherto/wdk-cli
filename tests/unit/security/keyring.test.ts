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

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Keyring } from '../../../src/security/keyring.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Keyring', () => {
  let tempDir: string
  let keyring: Keyring

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
    expect(await keyring.exists()).toBe(true)
    const retrieved = await keyring.retrieve('password123')
    expect(retrieved).toBe(phrase)
  })

  it('rejects wrong password on retrieve', async () => {
    await keyring.store('test phrase', 'correctpass')
    await expect(keyring.retrieve('wrongpass')).rejects.toThrow()
  })

  it('reports exists false when no file', async () => {
    expect(await keyring.exists()).toBe(false)
  })

  it('destroys the keyring file', async () => {
    await keyring.store('phrase', 'pass')
    expect(await keyring.exists()).toBe(true)
    await keyring.destroy()
    expect(await keyring.exists()).toBe(false)
  })

  it('destroy is safe when no file exists', async () => {
    await expect(keyring.destroy()).resolves.not.toThrow()
  })
})
