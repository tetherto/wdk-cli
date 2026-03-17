import { KeyService } from './key-service.js'
import { Keyring } from '../security/keyring.js'
import { sessionService } from './session-service.js'
import { getKeyringPath } from '../config/constants.js'
import { KeyNotFoundError } from '../errors/index.js'
import { promptPassword } from '../ui/prompts.js'

const keyService = new KeyService(new Keyring(getKeyringPath()))

// Process-scoped cache — avoids prompting for password multiple times in a single command
let seedPhraseCache: string | null = null
let seedPhrasePromise: Promise<string> | null = null

export async function getSeedPhrase(): Promise<string> {
  if (seedPhraseCache) return seedPhraseCache

  // Deduplicate concurrent calls — only the first caller runs the unlock flow
  if (seedPhrasePromise) return seedPhrasePromise

  seedPhrasePromise = (async () => {
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
  })()

  try {
    return await seedPhrasePromise
  } finally {
    seedPhrasePromise = null
  }
}

export function clearSeedPhraseCache(): void {
  seedPhraseCache = null
  seedPhrasePromise = null
}
