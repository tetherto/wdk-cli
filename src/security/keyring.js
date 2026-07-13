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

import {
  readFile,
  writeFile,
  access,
  unlink,
  mkdir,
  chmod,
  readdir,
  rm,
  stat
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { encrypt, decrypt } from '@tetherto/wdk-utils'
import { getWalletsDir, getWalletPath, getWalletDir } from '../config/constants.js'

/** @typedef {import('@tetherto/wdk-utils').EncryptedPayload} EncryptedPayload */

function isEnoent (err) {
  return err?.code === 'ENOENT'
}

/**
 * Low-level encrypted file keyring for a single seed file.
 */
export class Keyring {
  /**
   * Creates a Keyring bound to a specific encrypted seed file path.
   *
   * @param {string} path - Absolute path to the encrypted seed file.
   */
  constructor (path) {
    this.path = path
  }

  /**
   * Encrypts and writes a seed phrase to disk.
   *
   * @param {string} seedPhrase - The BIP-39 seed phrase to store.
   * @param {string} passphrase - The passphrase used to encrypt the seed.
   * @returns {Promise<void>}
   */
  async store (seedPhrase, passphrase) {
    const payload = encrypt(seedPhrase, passphrase)
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 })
    await chmod(this.path, 0o600)
  }

  /**
   * Reads and decrypts the seed phrase from disk.
   *
   * @param {string} passphrase - The passphrase used to decrypt the seed.
   * @returns {Promise<string>} The decrypted seed phrase.
   */
  async retrieve (passphrase) {
    const data = await readFile(this.path, 'utf8')
    const payload = JSON.parse(data)
    return decrypt(payload, passphrase)
  }

  /**
   * Returns whether the encrypted seed file exists on disk.
   *
   * @returns {Promise<boolean>} True if the file exists.
   */
  async exists () {
    try {
      await access(this.path)
      return true
    } catch (err) {
      if (isEnoent(err)) return false
      throw err
    }
  }

  /**
   * Deletes the encrypted seed file from disk.
   *
   * @returns {Promise<void>}
   */
  async destroy () {
    try {
      await unlink(this.path)
    } catch (err) {
      if (!isEnoent(err)) throw err
    }
  }
}

/**
 * High-level keyring for named wallets stored in the WDK wallets directory.
 */
export class WalletKeyring {
  /**
   * Encrypts and stores a seed phrase for a named wallet.
   *
   * @param {string} seedPhrase - The BIP-39 seed phrase to store.
   * @param {string} passphrase - The passphrase used to encrypt the seed.
   * @param {string} name - The wallet name.
   * @returns {Promise<void>}
   */
  async store (seedPhrase, passphrase, name) {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    await keyring.store(seedPhrase, passphrase)
  }

  /**
   * Retrieves and decrypts the seed phrase for a named wallet.
   *
   * @param {string} passphrase - The passphrase used to decrypt the seed.
   * @param {string} name - The wallet name.
   * @returns {Promise<string>} The decrypted seed phrase.
   */
  async retrieve (passphrase, name) {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    return keyring.retrieve(passphrase)
  }

  /**
   * Returns whether a named wallet exists on disk.
   *
   * @param {string} name - The wallet name.
   * @returns {Promise<boolean>} True if the wallet seed file exists.
   */
  async exists (name) {
    const walletPath = getWalletPath(name)
    const keyring = new Keyring(walletPath)
    return keyring.exists()
  }

  /**
   * Deletes the entire wallet directory for a named wallet.
   *
   * @param {string} name - The wallet name.
   * @returns {Promise<void>}
   */
  async destroy (name) {
    const walletDir = getWalletDir(name)
    try {
      await rm(walletDir, { recursive: true })
    } catch (err) {
      if (!isEnoent(err)) throw err
    }
  }

  /**
   * Lists all wallet names that have a seed.enc file.
   *
   * @returns {Promise<string[]>} Sorted array of wallet names.
   */
  async list () {
    const dir = getWalletsDir()
    let entries
    try {
      entries = await readdir(dir)
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }
    const wallets = []
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
