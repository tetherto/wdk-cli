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
import { Keyring } from '../security/keyring.js'
import { sessionService } from './session-service.js'
import { getKeyringPath } from '../config/constants.js'
import { KeyNotFoundError } from '../errors/index.js'
import { promptPassword } from '../ui/prompts.js'

const keyService = new KeyService(new Keyring(getKeyringPath()))

// Process-scoped cache — avoids prompting for password multiple times in a single command
let seedPhraseCache: string | null = null

export async function getSeedPhrase(): Promise<string> {
  if (seedPhraseCache) return seedPhraseCache

  if (!(await keyService.hasKey())) {
    throw new KeyNotFoundError()
  }

  // Check active session first
  const cached = await sessionService.get()
  if (cached) {
    seedPhraseCache = cached
    return cached
  }

  // No session — prompt for password
  const password = await promptPassword('Enter password to unlock wallet:')
  const phrase = await keyService.unlock(password)
  seedPhraseCache = phrase
  return phrase
}

export function clearSeedPhraseCache(): void {
  seedPhraseCache = null
}
