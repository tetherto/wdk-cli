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
