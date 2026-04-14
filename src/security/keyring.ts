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

import { readFile, writeFile, access, unlink, mkdir, chmod, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { encrypt, decrypt } from './encryption.js'
import { getWalletsDir, getWalletPath, getWalletDir } from '../config/constants.js'
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
    } catch { /* */ }
  }
}

export class WalletKeyring {
  async store(seedPhrase: string, password: string, name: string): Promise<void> {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    await keyring.store(seedPhrase, password)
  }

  async retrieve(password: string, name: string): Promise<string> {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    return keyring.retrieve(password)
  }

  async exists(name: string): Promise<boolean> {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    return keyring.exists()
  }

  async destroy(name: string): Promise<void> {
    const walletDir = getWalletDir(name)
    try {
      await rm(walletDir, { recursive: true })
    } catch { /* */ }
  }

  async list(): Promise<string[]> {
    try {
      const dir = getWalletsDir()
      const entries = await readdir(dir)
      const wallets: string[] = []
      for (const entry of entries) {
        const entryPath = join(dir, entry)
        const s = await stat(entryPath)
        if (s.isDirectory()) {
          try {
            await access(join(entryPath, 'seed.enc'))
            wallets.push(entry)
          } catch { /* */ }
        }
      }
      return wallets.sort()
    } catch {
      return []
    }
  }

  async hasAny(): Promise<boolean> {
    const wallets = await this.list()
    return wallets.length > 0
  }

}
