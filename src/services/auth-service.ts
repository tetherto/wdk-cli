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

import { KeyService } from './key-service.js'
import { WalletKeyring } from '../security/keyring.js'
import { KeyNotFoundError } from '../errors/index.js'
import { promptPassphrase } from '../ui/prompts.js'
import { configService } from './config-service.js'

const keyService = new KeyService(new WalletKeyring())

const seedPhraseCache = new Map<string, string>()
const seedPhrasePromises = new Map<string, Promise<string>>()

export async function getSeedPhrase(walletName: string = configService.getDefaultWallet()): Promise<string> {
  const cached = seedPhraseCache.get(walletName)
  if (cached) return cached

  const pending = seedPhrasePromises.get(walletName)
  if (pending) return pending

  const promise = (async () => {
    if (!(await keyService.hasAnyKey())) {
      throw new KeyNotFoundError()
    }

    const password = await promptPassphrase('Enter passphrase to unlock wallet:')
    const phrase = await keyService.unlock(password, walletName)
    seedPhraseCache.set(walletName, phrase)
    return phrase
  })()

  seedPhrasePromises.set(walletName, promise)

  try {
    return await promise
  } finally {
    seedPhrasePromises.delete(walletName)
  }
}

export function clearSeedPhraseCache(): void {
  seedPhraseCache.clear()
  seedPhrasePromises.clear()
}
