import { readFile, writeFile, access, unlink, mkdir, chmod } from 'node:fs/promises'
import { dirname } from 'node:path'
import { encrypt, decrypt } from './encryption.js'
import type { EncryptedPayload } from '../types/index.js'

export class Keyring {
  constructor(private readonly path: string) {}

  async store(seedPhrase: string, password: string): Promise<void> {
    const payload = encrypt(seedPhrase, password)
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 })
    await chmod(this.path, 0o600)
  }

  async retrieve(password: string): Promise<string> {
    const data = await readFile(this.path, 'utf8')
    const payload: EncryptedPayload = JSON.parse(data)
    return decrypt(payload, password)
  }

  async exists(): Promise<boolean> {
    try {
      await access(this.path)
      return true
    } catch {
      return false
    }
  }

  async destroy(): Promise<void> {
    try {
      await unlink(this.path)
    } catch {
      // File doesn't exist, nothing to destroy
    }
  }
}
