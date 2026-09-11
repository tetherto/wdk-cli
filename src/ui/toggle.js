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

/** @typedef {import('commander').Command} Command */

/**
 * @typedef {Object} ToggleOptions
 * @property {() => boolean} apply - Writes the override, returning true when it cleared a stale entry instead.
 * @property {boolean} enabled - The state being applied: true for enable, false for disable.
 * @property {string} label - How the entry is named in output, e.g. "Network 'tron'".
 * @property {Record<string, unknown>} result - Entry-identifying fields added to `--json` output.
 */

/**
 * Writes an enable/disable override and reports the result. The daemon caches
 * the registry per unlocked wallet, so it is locked to pick the change up.
 *
 * @param {Command} program - The root program, read for the global `--json` option.
 * @param {ToggleOptions} options - What to write and how to report it.
 * @returns {Promise<void>}
 */
export async function applyToggle (program, { apply, enabled, label, result }) {
  const stale = apply()
  const locked = await daemonClient.isRunning()
  if (locked) {
    await daemonClient.lock()
  }

  if (program.opts().json) {
    console.log(JSON.stringify({ ...result, enabled, stale }))
    return
  }
  console.log(stale
    ? `Stale override for ${label[0].toLowerCase()}${label.slice(1)} removed.`
    : `${label} ${enabled ? 'enabled' : 'disabled'}.`)
  if (locked) {
    console.log(chalk.yellow('All wallets have been locked so the change takes effect. Run `wdk wallet unlock` to continue.'))
  }
}
