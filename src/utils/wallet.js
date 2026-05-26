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
import { daemonClient } from '../daemon/client.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/**
 * Resolves and asserts that a wallet is unlocked via the daemon.
 *
 * @param {string} [wallet] - The wallet name. Defaults to the configured default wallet.
 * @returns {Promise<string>} The resolved wallet name.
 */
export async function requireUnlockedWallet(wallet) {
  const resolved = wallet || configService.getDefaultWallet()
  if (!resolved) {
    throw new WdkCliError(
      'No default wallet configured.',
      ErrorCode.MISSING_CONFIG,
      'Set one with: wdk wallet default --name <name>'
    )
  }
  if (!(await daemonClient.isWalletUnlocked(resolved))) {
    throw new WdkCliError(
      `Wallet '${resolved}' is not unlocked.`,
      ErrorCode.WALLET_NOT_UNLOCKED,
      `Run: wdk wallet unlock --name ${resolved}`
    )
  }
  return resolved
}
