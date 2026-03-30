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

import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import type { EncryptedPayload } from '../types/index.js'

const ALGORITHM = 'aes-256-gcm'
// N=2^14 (16384) with r=8 uses ~16MB — OWASP recommended minimum, within Node.js limits
const SCRYPT_N = 2 ** 14
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 32
const SALT_LEN = 32
const IV_LEN = 16

export function encrypt(plaintext: string, password: string): EncryptedPayload {
  const salt = randomBytes(SALT_LEN)
  const key = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  const iv = randomBytes(IV_LEN)

  try {
    const cipher = createCipheriv(ALGORITHM, key, iv)

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex')
    ciphertext += cipher.final('hex')
    const tag = cipher.getAuthTag()

    return {
      version: 1,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      ciphertext,
    }
  } finally {
    key.fill(0)
  }
}

export function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
}

export function decryptWithKey(payload: EncryptedPayload, key: Buffer): string {
  if (payload.version !== 1) {
    throw new Error(`Unsupported keyring version: ${payload.version}`)
  }

  const iv = Buffer.from(payload.iv, 'hex')
  const tag = Buffer.from(payload.tag, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8')
  plaintext += decipher.final('utf8')
  return plaintext
}

export function decrypt(payload: EncryptedPayload, password: string): string {
  if (payload.version !== 1) {
    throw new Error(`Unsupported keyring version: ${payload.version}`)
  }

  const salt = Buffer.from(payload.salt, 'hex')
  const key = deriveKey(password, salt)
  try {
    return decryptWithKey(payload, key)
  } finally {
    key.fill(0)
  }
}
