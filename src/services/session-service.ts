import { readFile, writeFile, unlink, chmod, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { getSessionPath, SESSION_TTL_MINUTES } from '../config/constants.js'

const ALGORITHM = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 16

interface SessionData {
  ciphertext: string
  iv: string
  tag: string
  expiresAt: number
}

class SessionService {
  private readonly path = getSessionPath()

  async create(seedPhrase: string, ttlMinutes: number = SESSION_TTL_MINUTES): Promise<void> {
    const key = randomBytes(KEY_LEN)
    const iv = randomBytes(IV_LEN)
    const cipher = createCipheriv(ALGORITHM, key, iv)

    let ciphertext = cipher.update(seedPhrase, 'utf8', 'hex')
    ciphertext += cipher.final('hex')
    const tag = cipher.getAuthTag()

    const session: SessionData & { key: string } = {
      ciphertext,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      key: key.toString('hex'),
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
    }

    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, JSON.stringify(session), 'utf8')
    await chmod(this.path, 0o600)
  }

  async get(): Promise<string | null> {
    try {
      const data = await readFile(this.path, 'utf8')
      const session: SessionData & { key: string } = JSON.parse(data)

      if (Date.now() > session.expiresAt) {
        await this.destroy()
        return null
      }

      const key = Buffer.from(session.key, 'hex')
      const iv = Buffer.from(session.iv, 'hex')
      const tag = Buffer.from(session.tag, 'hex')
      const decipher = createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(tag)

      let plaintext = decipher.update(session.ciphertext, 'hex', 'utf8')
      plaintext += decipher.final('utf8')
      return plaintext
    } catch {
      return null
    }
  }

  async destroy(): Promise<void> {
    try {
      await unlink(this.path)
    } catch {
      // File doesn't exist
    }
  }

  async isActive(): Promise<boolean> {
    const seed = await this.get()
    return seed !== null
  }

  async ttlRemaining(): Promise<number> {
    try {
      const data = await readFile(this.path, 'utf8')
      const session: SessionData = JSON.parse(data)
      const remaining = session.expiresAt - Date.now()
      return remaining > 0 ? remaining : 0
    } catch {
      return 0
    }
  }
}

export const sessionService = new SessionService()
