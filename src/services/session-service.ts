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

import { readFile, writeFile, unlink, chmod, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { getSessionPath, SESSION_TTL_MINUTES, DEFAULT_WALLET } from '../config/constants.js'

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
  private readonly keyPath = getSessionPath() + '.key'

  async create(seeds: Map<string, string>, ttlMinutes: number = SESSION_TTL_MINUTES): Promise<void> {
    const key = randomBytes(KEY_LEN)
    const iv = randomBytes(IV_LEN)
    const cipher = createCipheriv(ALGORITHM, key, iv)

    const payload = JSON.stringify(Object.fromEntries(seeds))
    let ciphertext = cipher.update(payload, 'utf8', 'hex')
    ciphertext += cipher.final('hex')
    const tag = cipher.getAuthTag()

    const session: SessionData = {
      ciphertext,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      expiresAt: ttlMinutes === 0 ? 0 : Date.now() + ttlMinutes * 60 * 1000,
    }

    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.keyPath, key.toString('hex'), 'utf8')
    await chmod(this.keyPath, 0o600)
    await writeFile(this.path, JSON.stringify(session), 'utf8')
    await chmod(this.path, 0o600)
  }

  async get(walletName: string = DEFAULT_WALLET): Promise<string | null> {
    const seeds = await this.getAll()
    if (!seeds) return null
    return seeds.get(walletName) || null
  }

  async getAll(): Promise<Map<string, string> | null> {
    try {
      const data = await readFile(this.path, 'utf8')
      const session: SessionData = JSON.parse(data)

      if (session.expiresAt !== 0 && Date.now() > session.expiresAt) {
        await this.destroy()
        return null
      }

      const keyHex = await readFile(this.keyPath, 'utf8')
      const key = Buffer.from(keyHex, 'hex')
      const iv = Buffer.from(session.iv, 'hex')
      const tag = Buffer.from(session.tag, 'hex')
      const decipher = createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(tag)

      let plaintext = decipher.update(session.ciphertext, 'hex', 'utf8')
      plaintext += decipher.final('utf8')

      const parsed = JSON.parse(plaintext)

      if (typeof parsed === 'string') {
        return new Map([[DEFAULT_WALLET, parsed]])
      }

      return new Map(Object.entries(parsed as Record<string, string>))
    } catch {
      return null
    }
  }

  async destroy(): Promise<void> {
    try { await unlink(this.path) } catch { }
    try { await unlink(this.keyPath) } catch { }
  }

  async isActive(): Promise<boolean> {
    const seeds = await this.getAll()
    return seeds !== null && seeds.size > 0
  }

  async ttlRemaining(): Promise<number> {
    try {
      const data = await readFile(this.path, 'utf8')
      const session: SessionData = JSON.parse(data)
      if (session.expiresAt === 0) return 0
      const remaining = session.expiresAt - Date.now()
      return remaining > 0 ? remaining : 0
    } catch {
      return 0
    }
  }
}

export const sessionService = new SessionService()
