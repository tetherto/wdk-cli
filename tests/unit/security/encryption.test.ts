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

import { describe, it, expect, vi } from 'vitest'
import * as crypto from 'node:crypto'
import { encrypt, decrypt } from '../../../src/security/encryption.js'

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
  return { ...actual, randomBytes: vi.fn((n: number) => actual.randomBytes(n)) }
})

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('encryption', () => {
  it('encrypts deterministically with pinned salt+iv', () => {
    const salt = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex')
    const iv = Buffer.from('aabbccddeeff00112233445566778899', 'hex')
    vi.mocked(crypto.randomBytes).mockReturnValueOnce(salt as any).mockReturnValueOnce(iv as any)

    const payload = encrypt(PHRASE, 'testpassword123')

    expect(payload).toEqual({
      version: 1,
      salt: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
      iv: 'aabbccddeeff00112233445566778899',
      tag: 'a63d3d292acebb7994dd137734109e56',
      ciphertext:
        'b41415c5d98ca2d54e8bb9f9826ade4a6cc0b5480a411ef68cfb8c4f2fa3640439d847426489e2d5ee3611d542d70464322b5e280f018eb1fa5ed10eba901b1e8ac8cb6e6bf0134870e80cb2bf123c2609b307498f71d7fa0ea84940e2',
    })
    expect(decrypt(payload, 'testpassword123')).toBe(PHRASE)
  })

  it('round-trips encrypt/decrypt correctly', () => {
    const payload = encrypt(PHRASE, 'testpassword123')
    expect(payload.version).toBe(1)
    expect(decrypt(payload, 'testpassword123')).toBe(PHRASE)
  })

  it('rejects wrong password', () => {
    const payload = encrypt('secret data', 'correctpassword')
    expect(() => decrypt(payload, 'wrongpassword')).toThrow()
  })

  it('produces different ciphertexts for same plaintext', () => {
    const p1 = encrypt('test data', 'password')
    const p2 = encrypt('test data', 'password')
    expect(p1.ciphertext).not.toBe(p2.ciphertext)
    expect(p1.salt).not.toBe(p2.salt)
  })

  it('rejects unsupported version', () => {
    const payload = encrypt('test', 'pass')
    const badPayload = { ...payload, version: 2 as any }
    expect(() => decrypt(badPayload, 'pass')).toThrow(/Unsupported keyring version/)
  })
})
