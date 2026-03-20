import WalletManager from '@tetherto/wdk-wallet'
import { WalletKeyring } from '../security/keyring.js'
import { InvalidSeedPhraseError, WrongPasswordError, KeyNotFoundError } from '../errors/index.js'
import { DEFAULT_WALLET } from '../config/constants.js'

export class KeyService {
  constructor(private walletKeyring: WalletKeyring) {}

  generate(wordCount: 12 | 24 = 12): string {
    return WalletManager.getRandomSeedPhrase(wordCount)
  }

  validate(seedPhrase: string): boolean {
    return WalletManager.isValidSeedPhrase(seedPhrase)
  }

  async store(seedPhrase: string, password: string, name: string = DEFAULT_WALLET): Promise<void> {
    if (!this.validate(seedPhrase)) {
      throw new InvalidSeedPhraseError()
    }
    await this.walletKeyring.store(seedPhrase, password, name)
  }

  async unlock(password: string, name: string = DEFAULT_WALLET): Promise<string> {
    if (!(await this.walletKeyring.exists(name))) {
      throw new KeyNotFoundError()
    }
    try {
      return await this.walletKeyring.retrieve(password, name)
    } catch {
      throw new WrongPasswordError()
    }
  }

  async unlockAll(password: string): Promise<Map<string, string>> {
    const names = await this.walletKeyring.list()
    if (names.length === 0) {
      throw new KeyNotFoundError()
    }

    const seeds = new Map<string, string>()
    for (const name of names) {
      try {
        const seed = await this.walletKeyring.retrieve(password, name)
        seeds.set(name, seed)
      } catch {
        throw new WrongPasswordError()
      }
    }
    return seeds
  }

  async hasKey(name: string = DEFAULT_WALLET): Promise<boolean> {
    return this.walletKeyring.exists(name)
  }

  async hasAnyKey(): Promise<boolean> {
    return this.walletKeyring.hasAny()
  }

  async destroy(name: string = DEFAULT_WALLET): Promise<void> {
    await this.walletKeyring.destroy(name)
  }

  async list(): Promise<string[]> {
    return this.walletKeyring.list()
  }

  async migrateLegacy(password: string): Promise<boolean> {
    return this.walletKeyring.migrateLegacy(password)
  }
}
