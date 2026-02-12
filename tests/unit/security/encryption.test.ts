import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../../../src/security/encryption.js'

describe('encryption', () => {
  it('round-trips encrypt/decrypt correctly', () => {
    const plaintext = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    const password = 'testpassword123'
    const payload = encrypt(plaintext, password)
    expect(payload.version).toBe(1)
    expect(payload.salt).toBeDefined()
    expect(payload.iv).toBeDefined()
    expect(payload.tag).toBeDefined()
    expect(payload.ciphertext).toBeDefined()
    const decrypted = decrypt(payload, password)
    expect(decrypted).toBe(plaintext)
  })

  it('rejects wrong password', () => {
    const payload = encrypt('secret data', 'correctpassword')
    expect(() => decrypt(payload, 'wrongpassword')).toThrow()
  })

  it('produces different ciphertexts for same plaintext', () => {
    const plaintext = 'test data'
    const password = 'password'
    const p1 = encrypt(plaintext, password)
    const p2 = encrypt(plaintext, password)
    expect(p1.ciphertext).not.toBe(p2.ciphertext)
    expect(p1.salt).not.toBe(p2.salt)
  })

  it('rejects unsupported version', () => {
    const payload = encrypt('test', 'pass')
    const badPayload = { ...payload, version: 2 as any }
    expect(() => decrypt(badPayload, 'pass')).toThrow(/Unsupported keyring version/)
  })
})
