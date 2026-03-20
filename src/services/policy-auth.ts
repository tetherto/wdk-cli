import { password } from '@inquirer/prompts'
import { KeyService } from './key-service.js'
import { WalletKeyring } from '../security/keyring.js'
import { WdkCliError, KeyNotFoundError } from '../errors/index.js'

const keyService = new KeyService(new WalletKeyring())

export async function requirePasswordForPolicy(): Promise<void> {
  if (!(await keyService.hasAnyKey())) {
    throw new KeyNotFoundError()
  }

  if (!process.stdin.isTTY) {
    throw new WdkCliError(
      'Policy changes require an interactive terminal.',
      'POLICY_TTY_REQUIRED',
      'Policy can only be modified from an interactive shell, not from scripts or AI agents.',
    )
  }

  const entered = await password({ message: 'Enter wallet password to modify policy:' })
  await keyService.unlock(entered)
}
