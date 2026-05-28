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

import { jest } from '@jest/globals'
import * as actualCrypto from 'node:crypto'

const queued = []

jest.unstable_mockModule('node:crypto', () => ({
  ...actualCrypto,
  default: actualCrypto,
  randomBytes: (n) => (queued.length > 0 ? queued.shift() : actualCrypto.randomBytes(n))
}))

const { encrypt, decrypt } = await import('../../../src/security/encryption.js')

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('encryption', () => {
  it('encrypts deterministically with pinned salt+iv', () => {
    queued.push(
      Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex'),
      Buffer.from('aabbccddeeff001122334455', 'hex')
    )

    const payload = encrypt(PHRASE, 'testpassword123')

    expect(payload).toEqual({
      version: 1,
      salt: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
      iv: 'aabbccddeeff001122334455',
      tag: '04247a2e56402b743718b1dd3c242623',
      ciphertext:
        '2ba561282f7a73e748caa33cd74711c0b468c5af1d3144ed78beea60bb18acada504eade33cc207265b3750d22648e449f96774ba5946a2f594369fc7ba42f64b432b958e98f3cda4853c04ed0e6ef7fd205b7958822c7a3d0ea7a7383'
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
    const badPayload = { ...payload, version: 2 }
    expect(() => decrypt(badPayload, 'pass')).toThrow(/Unsupported keyring version/)
  })
})
