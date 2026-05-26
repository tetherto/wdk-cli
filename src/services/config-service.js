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
import { APP_NAME, CONFIG_DEFAULTS, getConfigDir } from '../config/constants.js'

const ENV_MAP = {
  'indexer.apiKey': 'WDK_INDEXER_API_KEY'
}

class ConfigService {
  constructor() {
    this.conf = new Conf({
      projectName: APP_NAME,
      cwd: getConfigDir(),
      defaults: CONFIG_DEFAULTS
    })
  }

  get(key) {
    const envKey = ENV_MAP[key]
    if (envKey && process.env[envKey]) {
      return process.env[envKey]
    }
    return this.conf.get(key)
  }

  set(key, value) {
    this.conf.set(key, value)
  }

  delete(key) {
    this.conf.delete(key)
  }

  list() {
    const store = { ...this.conf.store }
    for (const [confKey, envKey] of Object.entries(ENV_MAP)) {
      if (process.env[envKey]) {
        this.#setNestedValue(store, confKey, process.env[envKey])
      }
    }
    return store
  }

  getDefaultWallet() {
    return this.get('defaultWallet') || ''
  }

  setDefaultWallet(name) {
    this.conf.set('defaultWallet', name)
  }

  getDefaultIndex() {
    return this.get('defaultIndex') || 0
  }

  setDefaultIndex(index) {
    this.conf.set('defaultIndex', index)
  }

  get configPath() {
    return this.conf.path
  }

  #setNestedValue(obj, path, value) {
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
