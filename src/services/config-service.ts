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
    // v0.1: clean up legacy keys
    for (const key of ['defaultChain', 'defaultNetwork'] as const) {
      if (key in this.conf.store) this.conf.delete(key)
    }

    // v0.2: moved providers.<network> to networks.<network>.provider
    const providers = (this.conf.store as Record<string, unknown>).providers as Record<string, string> | undefined
    if (providers && typeof providers === 'object') {
      for (const [network, url] of Object.entries(providers)) {
        if (url) this.conf.set(`networks.${network}.provider`, url)
      }
      this.conf.delete('providers')
    }

    // v0.3: rename bitcoin-testnet to bitcoin-testnet3
    if (this.conf.has('networks.bitcoin-testnet')) {
      this.conf.delete('networks.bitcoin-testnet')
    }

    // v0.3: migrate BTC networks to Electrum config.
    // conf uses shallow merge for defaults — since `networks` exists in the
    // store, per-network defaults are never applied. Write them explicitly.
    const BTC_DEFAULTS: Record<string, { host: string; port: number; protocol: string; network: string; bip: number }> = {
      bitcoin: { host: 'electrum.blockstream.info', port: 50001, protocol: 'tcp', network: 'bitcoin', bip: 84 },
      'bitcoin-testnet3': { host: 'electrum.blockstream.info', port: 60001, protocol: 'tcp', network: 'testnet', bip: 84 },
      'bitcoin-signet': { host: 'electrum.emzy.de', port: 60601, protocol: 'tcp', network: 'testnet', bip: 84 },
    }
    for (const [btcNet, defaults] of Object.entries(BTC_DEFAULTS)) {
      const stored = this.conf.get(`networks.${btcNet}`) as Record<string, unknown> | undefined
      if (!stored || !stored.host) {
        this.conf.set(`networks.${btcNet}`, defaults)
      }
    }

    // v0.2: clean up old top-level keys
    for (const key of ['evm'] as const) {
      if (key in this.conf.store) this.conf.delete(key)
    }
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
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
