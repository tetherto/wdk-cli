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

import WalletManager from '@tetherto/wdk-wallet'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('../security/keyring.js').WalletKeyring} WalletKeyring */

export class KeyService {
  /**
   * Creates a KeyService that delegates seed-phrase storage to the given keyring.
   *
   * @param {WalletKeyring} walletKeyring - The keyring backend.
   */
  constructor (walletKeyring) {
    this.walletKeyring = walletKeyring
  }

  /**
   * Generates a random BIP-39 seed phrase.
   *
   * @param {12 | 24} [wordCount] - Number of words (12 or 24).
   * @returns {string} The generated seed phrase.
   */
  generate (wordCount = 12) {
    return WalletManager.getRandomSeedPhrase(wordCount)
  }

  /**
   * Validates a BIP-39 seed phrase.
   *
   * @param {string} seedPhrase - The seed phrase to validate.
   * @returns {boolean} True if the seed phrase is valid.
   */
  validate (seedPhrase) {
    return WalletManager.isValidSeedPhrase(seedPhrase)
  }

  /**
   * Encrypts and stores a seed phrase in the keyring.
   *
   * @param {string} seedPhrase - The BIP-39 seed phrase to store.
   * @param {string} passphrase - The encryption passphrase.
   * @param {string} name - The wallet name.
   * @returns {Promise<void>}
   */
  async store (seedPhrase, passphrase, name) {
    if (!this.validate(seedPhrase)) {
      throw new WdkCliError(
        'Invalid seed phrase. Must be 12 or 24 BIP-39 words.',
        ErrorCode.INVALID_SEED_PHRASE
      )
    }
    await this.walletKeyring.store(seedPhrase, passphrase, name)
  }

  /**
   * Decrypts and retrieves the seed phrase from the keyring.
   *
   * @param {string} passphrase - The decryption passphrase.
   * @param {string} name - The wallet name.
   * @returns {Promise<string>} The decrypted seed phrase.
   */
  async unlock (passphrase, name) {
    if (!(await this.walletKeyring.exists(name))) {
      throw new WdkCliError('No key found.', ErrorCode.KEY_NOT_FOUND)
    }
    try {
      return await this.walletKeyring.retrieve(passphrase, name)
    } catch {
      throw new WdkCliError('Incorrect passphrase.', ErrorCode.WRONG_PASSPHRASE)
    }
  }

  /**
   * Returns whether a key exists in the keyring for the given wallet name.
   *
   * @param {string} name - The wallet name.
   * @returns {Promise<boolean>} True if a key exists.
   */
  async hasKey (name) {
    return this.walletKeyring.exists(name)
  }

  /**
   * Permanently removes a key from the keyring.
   *
   * @param {string} name - The wallet name to delete.
   * @returns {Promise<void>}
   */
  async destroy (name) {
    await this.walletKeyring.destroy(name)
  }

  /**
   * Lists all wallet names stored in the keyring.
   *
   * @returns {Promise<string[]>} Array of wallet names.
   */
  async list () {
    return this.walletKeyring.list()
  }
}
