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

import { chmodSync } from 'node:fs'
import Conf from 'conf'
import { APP_NAME, CONFIG_DEFAULTS } from '../config/constants.js'
import { getConfigDir } from '../config/paths.js'

/** @typedef {import('./config-service.js').ConfigStore} ConfigStore */

/**
 * Narrows the config directory to the owner. The files inside carry provider
 * credentials and wallet names; without this another local account can read
 * them. Windows has no POSIX mode and uses a per-user ACL instead, and a
 * directory on a read-only mount cannot be changed — neither is worth failing
 * a command over.
 *
 * @returns {void}
 */
function restrictConfigDir () {
  if (process.platform === 'win32') return
  try {
    chmodSync(getConfigDir(), 0o700)
  } catch {
    // Best effort: the config itself is already written owner-only.
  }
}

/**
 * Creates the config store the CLI, the MCP server and the desktop daemon
 * share: a JSON file in the config directory, backed by `Conf`.
 *
 * @returns {ConfigStore} The file-backed config store.
 */
export function createConfStore () {
  const conf = new Conf({
    projectName: APP_NAME,
    cwd: getConfigDir(),
    // Owner-only: this file holds provider API keys in clear text.
    configFileMode: 0o600,
    defaults: CONFIG_DEFAULTS
  })
  restrictConfigDir()

  return {
    get: (key) => conf.get(key),
    set: (key, value) => conf.set(key, value),
    delete: (key) => conf.delete(key),
    clear: () => conf.clear(),
    snapshot: () => ({ ...conf.store }),
    path: conf.path
  }
}
