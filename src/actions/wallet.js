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

import { daemonClient } from '../daemon/client.js'
import { WalletKeyring } from '../security/keyring.js'
import { configService } from '../services/config-service.js'
import { KeyService } from '../services/key-service.js'

/**
 * @typedef {Object} WalletInfo
 * @property {string} name - The wallet name.
 * @property {boolean} default - Whether this is the default wallet.
 * @property {boolean} unlocked - Whether the daemon holds this wallet unlocked.
 * @property {number} [ttlMs] - The session length in milliseconds (0 = no expiry). Unlocked wallets only.
 * @property {number} [ttlRemaining] - The session time left in milliseconds. Unlocked wallets only.
 */

/**
 * @typedef {Object} ListWalletsResult
 * @property {WalletInfo[]} wallets - Every stored wallet.
 * @property {number} count - The number of stored wallets.
 */

/**
 * Lists every stored wallet with its lock state. Reads the daemon's sessions but
 * never starts the daemon: if it cannot be reached, every wallet reads as locked.
 *
 * @returns {Promise<ListWalletsResult>} The wallets and their count.
 */
export async function listWallets () {
  const names = await new KeyService(new WalletKeyring()).list()
  const sessions = await daemonClient.listWallets().catch(() => [])
  const defaultWallet = configService.getDefaultWallet()
  const wallets = names.map((name) => {
    const session = sessions.find((s) => s.name === name)
    return {
      name,
      default: name === defaultWallet,
      unlocked: !!session,
      ...(session ? { ttlMs: session.ttlMs, ttlRemaining: session.ttlRemaining } : {})
    }
  })
  return { wallets, count: wallets.length }
}
