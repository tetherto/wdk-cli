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
import walletsFile from '../../wdk.config.json' with { type: 'json' }
import pkg from '../../package.json' with { type: 'json' }

const networkDefaults = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  networkDefaults[name] = entry.config ?? {}
}

/** @type {Record<string, unknown>} */
export const CONFIG_DEFAULTS = {
  ...walletsFile.defaults,
  networks: networkDefaults
}

export const APP_NAME = pkg.name
export const APP_VERSION = pkg.version
export const CONFIG_DIR = APP_NAME
const WALLETS_DIR = 'wallets'

/**
 * Returns the path to the application configuration directory.
 *
 * @returns {string} Absolute path to the config directory.
 */
export function getConfigDir() {
  const xdgConfig = process.env.XDG_CONFIG_HOME
  const base = xdgConfig || join(homedir(), '.config')
  return join(base, CONFIG_DIR)
}

export const SESSION_TTL_MINUTES = 5
export const DAEMON_SOCKET = 'daemon.sock'
export const DAEMON_PID = 'daemon.pid'
export const DAEMON_MAX_REQUEST_BYTES = 64 * 1024
export const DAEMON_START_RETRIES = 5
export const DAEMON_START_RETRY_INTERVAL_MS = 500
export const DAEMON_SPAWN_TIMEOUT_MS = 2000

/**
 * Returns the platform-appropriate daemon socket path.
 *
 * @returns {string} Absolute socket path or Windows named pipe.
 */
export function getDaemonSocketPath() {
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
export function getDaemonPidPath() {
  return join(getConfigDir(), DAEMON_PID)
}

/**
 * Returns the path to the wallets storage directory.
 *
 * @returns {string} Absolute path to the wallets directory.
 */
export function getWalletsDir() {
  return join(getConfigDir(), WALLETS_DIR)
}

/**
 * Validates a wallet name and returns the sanitized version.
 *
 * @param {string} name - The wallet name to validate.
 * @returns {string} The validated wallet name.
 */
export function validateWalletName(name) {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!sanitized || sanitized !== name) {
    throw new Error(`Invalid wallet name: '${name}'. Use only letters, numbers, hyphens, and underscores.`)
  }
  return sanitized
}

/**
 * Returns the directory path for a named wallet.
 *
 * @param {string} name - The wallet name.
 * @returns {string} Absolute path to the wallet directory.
 */
export function getWalletDir(name) {
  return join(getWalletsDir(), validateWalletName(name))
}

/**
 * Returns the path to the encrypted seed file for a named wallet.
 *
 * @param {string} name - The wallet name.
 * @returns {string} Absolute path to the seed.enc file.
 */
export function getWalletPath(name) {
  return join(getWalletDir(name), 'seed.enc')
}
