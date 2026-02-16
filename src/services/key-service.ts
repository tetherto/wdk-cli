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
import { Keyring } from '../security/keyring.js'
import { InvalidSeedPhraseError, WrongPasswordError, KeyNotFoundError } from '../errors/index.js'

export class KeyService {
  constructor(private keyring: Keyring) {}

  generate(wordCount: 12 | 24 = 12): string {
    return WalletManager.getRandomSeedPhrase(wordCount)
  }

  validate(seedPhrase: string): boolean {
    return WalletManager.isValidSeedPhrase(seedPhrase)
  }

  async store(seedPhrase: string, password: string): Promise<void> {
    if (!this.validate(seedPhrase)) {
      throw new InvalidSeedPhraseError()
    }
    await this.keyring.store(seedPhrase, password)
  }

  async unlock(password: string): Promise<string> {
    if (!(await this.keyring.exists())) {
      throw new KeyNotFoundError()
    }
    try {
      return await this.keyring.retrieve(password)
    } catch {
      throw new WrongPasswordError()
    }
  }

  async hasKey(): Promise<boolean> {
    return this.keyring.exists()
  }

  async destroy(): Promise<void> {
    await this.keyring.destroy()
  }
}
