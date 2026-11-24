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

import { join } from 'node:path'
import { homedir } from 'node:os'
import { CONFIG_DIR, DAEMON_SOCKET, DAEMON_PID, validateWalletName } from './constants.js'

const WALLETS_DIR = 'wallets'

/**
 * Returns the path to the application configuration directory.
 *
 * @returns {string} Absolute path to the config directory.
 */
export function getConfigDir () {
  const xdgConfig = process.env.XDG_CONFIG_HOME
  const base = xdgConfig || join(homedir(), '.config')
  return join(base, CONFIG_DIR)
}

/**
 * Returns the platform-appropriate daemon socket path.
 *
 * @returns {string} Absolute socket path or Windows named pipe.
 */
export function getDaemonSocketPath () {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\wdk-cli-daemon'
  }
  return join(getConfigDir(), DAEMON_SOCKET)
}

/**
 * Returns the path to the daemon PID file.
 *
 * @returns {string} Absolute path to the daemon PID file.
 */
export function getDaemonPidPath () {
  return join(getConfigDir(), DAEMON_PID)
}

/**
 * Returns the path to the wallets storage directory.
 *
 * @returns {string} Absolute path to the wallets directory.
 */
export function getWalletsDir () {
  return join(getConfigDir(), WALLETS_DIR)
}

/**
 * Returns the directory path for a named wallet.
 *
 * @param {string} name - The wallet name.
 * @returns {string} Absolute path to the wallet directory.
 */
export function getWalletDir (name) {
  return join(getWalletsDir(), validateWalletName(name))
}

/**
 * Returns the path to the encrypted seed file for a named wallet.
 *
 * @param {string} name - The wallet name.
 * @returns {string} Absolute path to the seed.enc file.
 */
export function getWalletPath (name) {
  return join(getWalletDir(name), 'seed.enc')
}
