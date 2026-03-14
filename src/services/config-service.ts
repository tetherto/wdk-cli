import Conf from 'conf'
import { CONFIG_DEFAULTS } from '../config/schema.js'
const ENV_MAP: Record<string, string> = {
  'indexer.baseUrl': 'WDK_INDEXER_BASE_URL',
  'indexer.apiKey': 'WDK_INDEXER_API_KEY',
}

class ConfigService {
  private conf: Conf

  constructor() {
    this.conf = new Conf({
      projectName: 'wdk-cli',
      defaults: CONFIG_DEFAULTS as Record<string, unknown>,
    })
    this.migrate()
  }

  get(key: string): unknown {
    const envKey = ENV_MAP[key]
    if (envKey && process.env[envKey]) {
      return process.env[envKey]
    }
    return this.conf.get(key)
  }

  set(key: string, value: unknown): void {
    this.conf.set(key, value)
  }

  delete(key: string): void {
    this.conf.delete(key)
  }

  list(): Record<string, unknown> {
    const store = { ...this.conf.store }
    for (const [confKey, envKey] of Object.entries(ENV_MAP)) {
      if (process.env[envKey]) {
        this.setNestedValue(store, confKey, process.env[envKey])
      }
    }
    return store
  }

  getProviderUrl(network: string): string {
    const envKey = `WDK_PROVIDER_${network.toUpperCase().replace(/-/g, '_')}`
    if (process.env[envKey]) return process.env[envKey]!
    // Check per-network config override
    const provider = this.conf.get(`networks.${network}.provider`) as string | undefined
    if (provider) return provider
    throw new Error(`No provider configured for network '${network}'. Use wdk config set to configure network settings.`)
  }

  get configPath(): string {
    return this.conf.path
  }

  private migrate(): void {
    // Conf uses shallow merge for defaults — since `networks` exists in the
    // store, per-network defaults are never applied. Write them explicitly.
    const networkDefaults = (CONFIG_DEFAULTS as Record<string, unknown>).networks as Record<string, Record<string, unknown>>
    for (const [net, expected] of Object.entries(networkDefaults)) {
      const stored = this.conf.get(`networks.${net}`) as Record<string, unknown> | undefined
      if (!stored) {
        this.conf.set(`networks.${net}`, expected)
      } else {
        for (const [key, value] of Object.entries(expected)) {
          if (!(key in stored)) {
            this.conf.set(`networks.${net}.${key}`, value)
          }
        }
      }
    }
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.')
    let current = obj
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) current[keys[i]] = {}
      current = current[keys[i]] as Record<string, unknown>
    }
    current[keys[keys.length - 1]] = value
  }
}

export const configService = new ConfigService()
