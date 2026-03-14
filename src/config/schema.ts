import defaults from './defaults.json' with { type: 'json' }
import type { NetworkType, ConfigFieldSchema } from '../types/index.js'

export const CONFIG_DEFAULTS = defaults

export const CONFIG_SCHEMAS: Record<NetworkType, ConfigFieldSchema[]> = {
  'wdk-wallet-btc': [
    { key: 'host', description: 'Electrum server host', required: true },
    { key: 'port', description: 'Electrum server port', required: true, type: 'number' },
    { key: 'protocol', description: 'Connection protocol (tcp/ssl)' },
    { key: 'network', description: 'Bitcoin network (bitcoin/testnet)' },
    { key: 'bip', description: 'BIP derivation path (44/49/84)', type: 'number' },
  ],
  'wdk-wallet-evm': [
    { key: 'provider', description: 'JSON-RPC endpoint URL', required: true },
    { key: 'transferMaxFee', description: 'Max fee in wei for transfers' },
  ],
  'wdk-wallet-solana': [
    { key: 'provider', description: 'Solana RPC endpoint URL', required: true },
  ],
  'wdk-wallet-spark': [
    { key: 'sparkNetwork', description: 'Spark network (MAINNET/REGTEST)', required: true, options: ['MAINNET', 'REGTEST'] },
    { key: 'sparkScanApiKey', description: 'SparkScan API key', secret: true },
  ],
  'wdk-wallet-tron': [
    { key: 'provider', description: 'Tron RPC endpoint URL', required: true },
    { key: 'transferMaxFee', description: 'Max fee in sun for transfers' },
  ],
  'wdk-wallet-evm-erc-4337': [
    { key: 'chainId', description: 'EVM chain ID', required: true, type: 'number' },
    { key: 'blockchain', description: 'Blockchain identifier' },
    { key: 'provider', description: 'JSON-RPC endpoint URL', required: true },
    { key: 'bundlerUrl', description: 'ERC-4337 bundler endpoint', required: true },
    { key: 'entryPointAddress', description: 'EntryPoint contract address', required: true },
    { key: 'safeModulesVersion', description: 'Safe modules version', required: true },
    { key: 'mode', description: 'Gas payment mode', required: true, options: ['paymasterToken', 'sponsored', 'nativeCoins'] },
    { key: 'paymasterUrl', description: 'Paymaster service URL',
      required: (c) => c.mode !== 'nativeCoins',
      condition: (c) => c.mode !== 'nativeCoins' },
    { key: 'paymasterAddress', description: 'Paymaster contract address',
      required: (c) => c.mode === 'paymasterToken',
      condition: (c) => c.mode === 'paymasterToken' },
    { key: 'paymasterToken', description: 'Token address for paymaster payment',
      required: (c) => c.mode === 'paymasterToken',
      condition: (c) => c.mode === 'paymasterToken' },
    { key: 'sponsorshipPolicyId', description: 'Sponsorship policy ID',
      condition: (c) => c.mode === 'sponsored' },
    { key: 'transferMaxFee', description: 'Max fee in wei for transfers',
      condition: (c) => c.mode !== 'sponsored' },
    { key: 'isSponsored', description: 'Enable sponsored gas (set via mode)',
      condition: () => false },
    { key: 'useNativeCoins', description: 'Use native coins for gas (set via mode)',
      condition: () => false },
  ],
}

/** Get fields relevant to the current config (evaluates conditions) */
export function getVisibleFields(type: NetworkType, config: Record<string, unknown> = {}): ConfigFieldSchema[] {
  const schema = CONFIG_SCHEMAS[type]
  if (!schema) return []
  return schema.filter(f => !f.condition || f.condition(config))
}

/** Check if a field is required given the current config */
export function isFieldRequired(field: ConfigFieldSchema, config: Record<string, unknown>): boolean {
  if (typeof field.required === 'function') return field.required(config)
  return field.required === true
}

/** Get required fields that are missing or empty */
export function getMissingFields(type: NetworkType, config: Record<string, unknown>): ConfigFieldSchema[] {
  return getVisibleFields(type, config).filter(f => {
    if (!isFieldRequired(f, config)) return false
    const value = config[f.key]
    return value === undefined || value === '' || value === null
  })
}

/** Validate a key/value pair for a network type */
export function validateKey(key: string, value: string, type?: NetworkType): string | null {
  if (!type) return null

  const schema = CONFIG_SCHEMAS[type]
  if (!schema) return null

  const field = schema.find(f => f.key === key)
  if (!field) {
    const validKeys = schema.filter(f => !f.condition || f.condition({})).map(f => f.key)
    return `Unknown config key '${key}'. Valid keys: ${validKeys.join(', ')}`
  }

  if (field.options && !field.options.includes(value)) {
    return `Invalid value '${value}' for '${key}'. Valid options: ${field.options.join(', ')}`
  }

  if (field.type === 'number' && isNaN(Number(value))) {
    return `'${key}' must be a number`
  }

  if (field.type === 'boolean' && value !== 'true' && value !== 'false') {
    return `'${key}' must be true or false`
  }

  return null
}
