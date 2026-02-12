import Conf from 'conf'
import { CHAINS } from '../config/chains.js'
import { CONFIG_DEFAULTS } from '../config/schema.js'
import type { ChainName, WdkCliConfig } from '../types/index.js'

const ENV_MAP: Record<string, string> = {
  defaultChain: 'WDK_DEFAULT_CHAIN',
  'indexer.baseUrl': 'WDK_INDEXER_BASE_URL',
  'indexer.apiKey': 'WDK_INDEXER_API_KEY',
}

class ConfigService {
  private conf: Conf<WdkCliConfig>

  constructor() {
    this.conf = new Conf<WdkCliConfig>({
      projectName: 'wdk-cli',
      defaults: CONFIG_DEFAULTS,
    })
  }

  get<K extends string>(key: K): unknown {
    // Check env var first
    const envKey = ENV_MAP[key]
    if (envKey && process.env[envKey]) {
      return process.env[envKey]
    }
    return this.conf.get(key as any)
  }

  set(key: string, value: unknown): void {
    this.conf.set(key as any, value as any)
  }

  delete(key: string): void {
    this.conf.delete(key as any)
  }

  list(): Record<string, unknown> {
    const store = { ...this.conf.store }
    // Overlay env vars
    for (const [confKey, envKey] of Object.entries(ENV_MAP)) {
      if (process.env[envKey]) {
        this.setNestedValue(store, confKey, process.env[envKey])
      }
    }
    return store
  }

  getProviderUrl(chain: ChainName): string {
    const envKey = `WDK_PROVIDER_${chain.toUpperCase()}`
    if (process.env[envKey]) return process.env[envKey]!
    const configured = this.conf.get(`providers.${chain}` as any) as string | undefined
    if (configured) return configured
    return CHAINS[chain].defaultProvider
  }

  get configPath(): string {
    return this.conf.path
  }

  private setNestedValue(obj: any, path: string, value: unknown): void {
    const keys = path.split('.')
    let current = obj
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) current[keys[i]] = {}
      current = current[keys[i]]
    }
    current[keys[keys.length - 1]] = value
  }
}

export const configService = new ConfigService()
