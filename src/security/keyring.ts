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

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT'
}

export class Keyring {
  constructor(private readonly path: string) {}

  async store(seedPhrase: string, passphrase: string): Promise<void> {
    const payload = encrypt(seedPhrase, passphrase)
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 })
    await chmod(this.path, 0o600)
  }

  async retrieve(passphrase: string): Promise<string> {
    const data = await readFile(this.path, 'utf8')
    const payload: EncryptedPayload = JSON.parse(data)
    return decrypt(payload, passphrase)
  }

  async exists(): Promise<boolean> {
    try {
      await access(this.path)
      return true
    } catch (err) {
      if (isEnoent(err)) return false
      throw err
    }
  }

  async destroy(): Promise<void> {
    try {
      await unlink(this.path)
    } catch (err) {
      if (!isEnoent(err)) throw err
    }
  }
}

export class WalletKeyring {
  async store(seedPhrase: string, passphrase: string, name: string): Promise<void> {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    await keyring.store(seedPhrase, passphrase)
  }

  async retrieve(passphrase: string, name: string): Promise<string> {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    return keyring.retrieve(passphrase)
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
    } catch (err) {
      if (!isEnoent(err)) throw err
    }
  }

  async list(): Promise<string[]> {
    const dir = getWalletsDir()
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }
    const wallets: string[] = []
    for (const entry of entries) {
      const entryPath = join(dir, entry)
      const s = await stat(entryPath)
      if (!s.isDirectory()) continue
      try {
        await access(join(entryPath, 'seed.enc'))
        wallets.push(entry)
      } catch (err) {
        if (!isEnoent(err)) throw err
      }
    }
    return wallets.sort()
  }
}
