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
import Conf from 'conf'
import { CONFIG_DEFAULTS } from '../config/constants.js'

const ENV_MAP: Record<string, string> = {
  'indexer.apiKey': 'WDK_INDEXER_API_KEY',
}

function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME
  const base = xdgConfig || join(homedir(), '.config')
  return join(base, 'wdk-cli')
}

class ConfigService {
  private conf: Conf

  constructor() {
    this.conf = new Conf({
      projectName: 'wdk-cli',
      cwd: getConfigDir(),
      defaults: CONFIG_DEFAULTS as Record<string, unknown>,
    })
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

  getDefaultWallet(): string {
    return (this.conf.get('defaultWallet') as string) || ''
  }

  setDefaultWallet(name: string): void {
    this.conf.set('defaultWallet', name)
  }

  getDefaultIndex(): number {
    return (this.conf.get('defaultIndex') as number) || 0
  }

  setDefaultIndex(index: number): void {
    this.conf.set('defaultIndex', index)
  }

  get configPath(): string {
    return this.conf.path
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
