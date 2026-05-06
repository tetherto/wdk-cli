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

const networkDefaults: Record<string, Record<string, unknown>> = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  networkDefaults[name] = (entry as Record<string, unknown>).config as Record<string, unknown> ?? {}
}

export const CONFIG_DEFAULTS: Record<string, unknown> = {
  ...walletsFile.defaults,
  networks: networkDefaults,
}

export const APP_NAME = pkg.name
export const APP_VERSION = pkg.version
export const CONFIG_DIR = APP_NAME
export const WALLETS_DIR = 'wallets'

function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME
  const base = xdgConfig || join(homedir(), '.config')
  return join(base, CONFIG_DIR)
}

export const SESSION_TTL_MINUTES = 5
export const DAEMON_SOCKET = 'daemon.sock'
export const DAEMON_PID = 'daemon.pid'

export function getDaemonSocketPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\wdk-cli-daemon'
  }
  return join(getConfigDir(), DAEMON_SOCKET)
}

export function getDaemonPidPath(): string {
  return join(getConfigDir(), DAEMON_PID)
}

export function getWalletsDir(): string {
  return join(getConfigDir(), WALLETS_DIR)
}

export function validateWalletName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!sanitized || sanitized !== name) {
    throw new Error(`Invalid wallet name: '${name}'. Use only letters, numbers, hyphens, and underscores.`)
  }
  return sanitized
}

export function getWalletDir(name: string): string {
  return join(getWalletsDir(), validateWalletName(name))
}

export function getWalletPath(name: string): string {
  return join(getWalletDir(name), 'seed.enc')
}

