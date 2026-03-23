import { KeyService } from './key-service.js'
import { WalletKeyring } from '../security/keyring.js'
import { KeyNotFoundError } from '../errors/index.js'
import { promptPassword } from '../ui/prompts.js'
import { DEFAULT_WALLET } from '../config/constants.js'

const keyService = new KeyService(new WalletKeyring())

const seedPhraseCache = new Map<string, string>()
const seedPhrasePromises = new Map<string, Promise<string>>()

export async function getSeedPhrase(walletName: string = DEFAULT_WALLET): Promise<string> {
  const cached = seedPhraseCache.get(walletName)
  if (cached) return cached

  const pending = seedPhrasePromises.get(walletName)
  if (pending) return pending

  const promise = (async () => {
    if (!(await keyService.hasAnyKey())) {
      throw new KeyNotFoundError()
    }

    const password = await promptPassword('Enter password to unlock wallet:')
    await keyService.migrateLegacy(password)
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
