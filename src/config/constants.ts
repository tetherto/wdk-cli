import { join } from 'node:path'
import { homedir } from 'node:os'

export const APP_NAME = 'wdk-cli'
export const APP_VERSION = '0.0.1'
export const CONFIG_DIR = APP_NAME
export const KEYRING_FILENAME = 'keyring.enc'
export const WALLETS_DIR = 'wallets'
export const DEFAULT_WALLET = 'default'

function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME
  const base = xdgConfig || join(homedir(), '.config')
  return join(base, CONFIG_DIR)
}

export const SESSION_FILENAME = 'session.json'
export const SESSION_TTL_MINUTES = 30
export const DAEMON_SOCKET = 'daemon.sock'
export const DAEMON_PID = 'daemon.pid'

export function getDaemonSocketPath(): string {
  return join(getConfigDir(), DAEMON_SOCKET)
}

export function getDaemonPidPath(): string {
  return join(getConfigDir(), DAEMON_PID)
}

export function getKeyringPath(): string {
  return join(getConfigDir(), KEYRING_FILENAME)
}

export function getWalletsDir(): string {
  return join(getConfigDir(), WALLETS_DIR)
}

export function getWalletPath(name: string = DEFAULT_WALLET): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!sanitized || sanitized !== name) {
    throw new Error(`Invalid wallet name: '${name}'. Use only letters, numbers, hyphens, and underscores.`)
  }
  return join(getWalletsDir(), `${sanitized}.enc`)
}

export function getSessionPath(): string {
  return join(getConfigDir(), SESSION_FILENAME)
}
