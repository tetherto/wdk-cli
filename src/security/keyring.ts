import { readFile, writeFile, access, unlink, mkdir, chmod, readdir } from 'node:fs/promises'
import { dirname, basename } from 'node:path'
import { encrypt, decrypt } from './encryption.js'
import { getWalletsDir, getWalletPath, getKeyringPath, DEFAULT_WALLET } from '../config/constants.js'
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
  async store(seedPhrase: string, password: string, name: string = DEFAULT_WALLET): Promise<void> {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    await keyring.store(seedPhrase, password)
  }

  async retrieve(password: string, name: string = DEFAULT_WALLET): Promise<string> {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    return keyring.retrieve(password)
  }

  async exists(name: string = DEFAULT_WALLET): Promise<boolean> {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    return keyring.exists()
  }

  async destroy(name: string = DEFAULT_WALLET): Promise<void> {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    return keyring.destroy()
  }

  async list(): Promise<string[]> {
    try {
      const dir = getWalletsDir()
      const files = await readdir(dir)
      return files
        .filter((f) => f.endsWith('.enc'))
        .map((f) => basename(f, '.enc'))
        .sort()
    } catch {
      return []
    }
  }

  async hasAny(): Promise<boolean> {
    // Check new wallets/ directory first
    const wallets = await this.list()
    if (wallets.length > 0) return true
    // Fallback: check legacy keyring.enc
    try {
      await access(getKeyringPath())
      return true
    } catch {
      return false
    }
  }

  async migrateLegacy(password: string): Promise<boolean> {
    const legacyPath = getKeyringPath()
    try {
      await access(legacyPath)
    } catch {
      return false
    }

    const wallets = await this.list()
    if (wallets.length > 0) return false

    const legacyKeyring = new Keyring(legacyPath)
    const seedPhrase = await legacyKeyring.retrieve(password)
    await this.store(seedPhrase, password, DEFAULT_WALLET)
    await legacyKeyring.destroy()
    return true
  }
}
