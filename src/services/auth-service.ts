import { KeyService } from './key-service.js'
import { WalletKeyring } from '../security/keyring.js'
import { daemonClient } from '../daemon/client.js'
import { sessionService } from './session-service.js'
import { KeyNotFoundError } from '../errors/index.js'
import { promptPassword } from '../ui/prompts.js'
import { DEFAULT_WALLET } from '../config/constants.js'

const keyService = new KeyService(new WalletKeyring())

// Process-scoped cache — avoids repeated daemon/session calls in a single command
const seedPhraseCache = new Map<string, string>()
let seedPhrasePromise: Promise<string> | null = null

export async function getSeedPhrase(walletName: string = DEFAULT_WALLET): Promise<string> {
  const cached = seedPhraseCache.get(walletName)
  if (cached) return cached

  // Deduplicate concurrent calls — only the first caller runs the unlock flow
  if (seedPhrasePromise) return seedPhrasePromise

  seedPhrasePromise = (async () => {
    if (!(await keyService.hasAnyKey())) {
      throw new KeyNotFoundError()
    }

    // Try daemon first
    try {
      if (await daemonClient.isRunning()) {
        const seed = await daemonClient.getSeed(walletName)
        seedPhraseCache.set(walletName, seed)
        return seed
      }
    } catch { /* daemon not available */ }

    // Fallback to session files (backward compatibility)
    const sessionSeed = await sessionService.get(walletName)
    if (sessionSeed) {
      seedPhraseCache.set(walletName, sessionSeed)
      return sessionSeed
    }

    // No daemon, no session — prompt for password
    const password = await promptPassword('Enter password to unlock wallet:')
    await keyService.migrateLegacy(password)
    const phrase = await keyService.unlock(password, walletName)
    seedPhraseCache.set(walletName, phrase)
    return phrase
  })()

  try {
    return await seedPhrasePromise
  } finally {
    seedPhrasePromise = null
  }
}

export function clearSeedPhraseCache(): void {
  seedPhraseCache.clear()
  seedPhrasePromise = null
}
