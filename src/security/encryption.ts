import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import type { EncryptedPayload } from '../types/index.js'

const ALGORITHM = 'aes-256-gcm'
// Use lower scrypt params in test environment to avoid memory errors
const SCRYPT_N = process.env.NODE_ENV === 'test' ? 2 ** 14 : 2 ** 17
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 32
const SALT_LEN = 32
const IV_LEN = 16

export function encrypt(plaintext: string, password: string): EncryptedPayload {
  const salt = randomBytes(SALT_LEN)
  const key = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  const iv = randomBytes(IV_LEN)
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
}

export function decrypt(payload: EncryptedPayload, password: string): string {
  if (payload.version !== 1) {
    throw new Error(`Unsupported keyring version: ${payload.version}`)
  }

  const salt = Buffer.from(payload.salt, 'hex')
  const iv = Buffer.from(payload.iv, 'hex')
  const tag = Buffer.from(payload.tag, 'hex')
  // Use same N value as encryption (may be lowered in test env)
  const key = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8')
  plaintext += decipher.final('utf8')
  return plaintext
}
