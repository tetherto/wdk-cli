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

import { packageJson } from './bundled-json.js'
import { walletsFile } from './wdk-config.js'
import { WdkCliError, ErrorCode } from '../errors/wdk-cli-error.js'

const pkg = packageJson

const networkDefaults = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  networkDefaults[name] = entry.config ?? {}
}

/** @type {Record<string, unknown>} */
export const CONFIG_DEFAULTS = {
  ...walletsFile.defaults,
  networks: networkDefaults
}

export const PACKAGE_NAME = pkg.name
export const APP_NAME = 'wdk-cli'
export const APP_VERSION = pkg.version
export const CONFIG_DIR = APP_NAME

export const SESSION_TTL_MINUTES = 5
export const MAX_SESSION_TTL_MINUTES = 7 * 24 * 60
export const DAEMON_SOCKET = 'daemon.sock'
export const DAEMON_PID = 'daemon.pid'
export const DAEMON_MAX_REQUEST_BYTES = 64 * 1024
/** How long the client waits for a freshly spawned daemon to answer; a cold first start loads the whole WDK stack. */
export const DAEMON_START_TIMEOUT_MS = 15000
/** How often the client checks whether a freshly spawned daemon answers. */
export const DAEMON_START_POLL_INTERVAL_MS = 100
/** Socket timeout for daemon control requests served from memory (status, lock). */
export const IPC_CONTROL_TIMEOUT_MS = 5000
/** Socket timeout for single-operation requests (one RPC round trip or local key work). */
export const IPC_READ_TIMEOUT_MS = 30000
/** Socket timeout for requests that sign and broadcast a transaction. */
export const IPC_WRITE_TIMEOUT_MS = 60000
/** Wait budget sent with a finality wait when no explicit timeout is given. */
export const DEFAULT_FINALITY_TIMEOUT_MS = 150000
/** IPC socket headroom over a daemon-side wait, so the client outlasts the daemon's poll loop. */
export const IPC_WAIT_BUFFER_MS = 30000

/**
 * Validates a wallet name and returns the sanitized version.
 *
 * @param {string} name - The wallet name to validate.
 * @returns {string} The validated wallet name.
 */
export function validateWalletName (name) {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!sanitized || sanitized !== name) {
    throw new WdkCliError(
      `Invalid wallet name: '${name}'.`,
      ErrorCode.INVALID_ARGUMENT,
      'Use only letters, numbers, hyphens, and underscores.'
    )
  }
  return sanitized
}
