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

import { input, password } from '@inquirer/prompts'
import chalk from 'chalk'

let envPassphraseNoticeShown = false

/**
 * Prompts the user for a passphrase, or reads it from the WDK_PASSPHRASE environment variable.
 *
 * @param {string} [message] - Prompt message. Defaults to `'Enter passphrase:'`.
 * @returns {Promise<string>} The entered passphrase.
 */
export async function promptPassphrase(message = 'Enter passphrase:') {
  const envPassphrase = process.env.WDK_PASSPHRASE
  if (envPassphrase) {
    if (!envPassphraseNoticeShown) {
      console.error(chalk.dim('Note: using passphrase from WDK_PASSPHRASE env var.'))
      envPassphraseNoticeShown = true
    }
    return envPassphrase
  }
  return password({ message })
}

/**
 * Prompts the user to enter their BIP-39 seed phrase.
 *
 * @returns {Promise<string>} The entered seed phrase.
 */
export async function promptSeedPhrase() {
  return input({ message: 'Enter your seed phrase:' })
}
