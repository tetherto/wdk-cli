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

import { configService } from '../services/config-service.js'
import { KeyService } from '../services/key-service.js'
import { WalletKeyring } from '../security/keyring.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { promptPassphrase } from './prompts.js'

/**
 * Prompts the user for the default wallet's passphrase and verifies it is correct.
 * No-ops if no wallets exist.
 *
 * @returns {Promise<void>}
 */
export async function requirePassphraseConfirmation() {
  const keyService = new KeyService(new WalletKeyring())
  const wallets = await keyService.list()
  if (wallets.length === 0) return

  const defaultWallet = configService.getDefaultWallet()
  if (!defaultWallet) {
    throw new WdkCliError(
      'No default wallet is set.',
      ErrorCode.KEY_NOT_FOUND,
      "Run 'wdk wallet default <name>' to set a default wallet."
    )
  }
  if (!wallets.includes(defaultWallet)) {
    throw new WdkCliError(
      `Default wallet '${defaultWallet}' no longer exists.`,
      ErrorCode.KEY_NOT_FOUND,
      "Run 'wdk wallet default <name>' to point at an existing wallet."
    )
  }

  const passphrase = await promptPassphrase(`Enter passphrase of '${defaultWallet}' wallet to confirm:`)
  await keyService.unlock(passphrase, defaultWallet)
}
