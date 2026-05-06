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
import { promptPassphrase } from './prompts.js'

export async function requirePassphraseConfirmation(): Promise<void> {
  const keyService = new KeyService(new WalletKeyring())
  const defaultWallet = configService.getDefaultWallet()
  if (defaultWallet && await keyService.hasKey(defaultWallet)) {
    const passphrase = await promptPassphrase(`Enter passphrase of '${defaultWallet}' wallet to confirm:`)
    await keyService.unlock(passphrase, defaultWallet)
  }
}
