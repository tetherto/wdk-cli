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

import chalk from 'chalk'
import { daemonClient } from '../daemon/client.js'

/**
 * Ends the unlocked session after a config change, so the daemon reloads the
 * registry instead of serving the cached one. In text mode it always says when
 * the change takes effect; callers add the returned flag to `--json` output as
 * `walletsLocked`.
 *
 * @param {boolean} json - Whether the command is printing JSON.
 * @returns {Promise<boolean>} True when wallets were locked, false when none were unlocked.
 */
export async function lockWalletsAfterChange (json) {
  const locked = await daemonClient.isRunning()
  if (locked) await daemonClient.lock()
  if (!json) {
    console.log(locked
      ? chalk.yellow('All wallets have been locked so the change takes effect. Run `wdk wallet unlock` to continue.')
      : chalk.dim('The change takes effect at the next `wdk wallet unlock`.'))
  }
  return locked
}
