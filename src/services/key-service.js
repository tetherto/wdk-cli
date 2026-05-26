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

export class KeyService {
  constructor(walletKeyring) {
    this.walletKeyring = walletKeyring
  }

  generate(wordCount = 12) {
    return WalletManager.getRandomSeedPhrase(wordCount)
  }

  validate(seedPhrase) {
    return WalletManager.isValidSeedPhrase(seedPhrase)
  }

  async store(seedPhrase, passphrase, name) {
    if (!this.validate(seedPhrase)) {
      throw new WdkCliError('Invalid seed phrase. Must be 12 or 24 BIP-39 words.', ErrorCode.INVALID_SEED_PHRASE)
    }
    await this.walletKeyring.store(seedPhrase, passphrase, name)
  }

  async unlock(passphrase, name) {
    if (!(await this.walletKeyring.exists(name))) {
      throw new WdkCliError('No key found.', ErrorCode.KEY_NOT_FOUND)
    }
    try {
      return await this.walletKeyring.retrieve(passphrase, name)
    } catch {
      throw new WdkCliError('Incorrect passphrase.', ErrorCode.WRONG_PASSPHRASE)
    }
  }

  async hasKey(name) {
    return this.walletKeyring.exists(name)
  }

  async destroy(name) {
    await this.walletKeyring.destroy(name)
  }

  async list() {
    return this.walletKeyring.list()
  }
}
