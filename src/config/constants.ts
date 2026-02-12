import { join } from 'node:path'
import { homedir } from 'node:os'

export const APP_NAME = 'wdk-cli'
export const APP_VERSION = '0.1.0'
export const CONFIG_DIR = APP_NAME
export const KEYRING_FILENAME = 'keyring.enc'
export const WALLET_REGISTRY_FILENAME = 'wallets.json'

function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME
  const base = xdgConfig || join(homedir(), '.config')
  return join(base, CONFIG_DIR)
}

export function getKeyringPath(): string {
  return join(getConfigDir(), KEYRING_FILENAME)
}

export function getWalletRegistryPath(): string {
  return join(getConfigDir(), WALLET_REGISTRY_FILENAME)
}
