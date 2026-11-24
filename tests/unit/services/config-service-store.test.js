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

import { configService } from '../../../src/services/config-service.js'

/**
 * A plain in-memory store, as an embedding host would supply.
 *
 * @param {Record<string, unknown>} initial - The starting values.
 * @returns {import('../../../src/services/config-service.js').ConfigStore} The store.
 */
function memoryStore (initial) {
  let values = { ...initial }
  return {
    get: (key) => values[key],
    set: (key, value) => { values[key] = value },
    delete: (key) => { delete values[key] },
    clear: () => { values = {} },
    snapshot: () => ({ ...values }),
    path: 'memory'
  }
}

describe('ConfigService store', () => {
  it('refuses config access before a store is registered', () => {
    expect(() => configService.get('defaultWallet')).toThrow(
      'No config store registered: call configService.useStore() at startup.'
    )
  })

  it('reads and writes through the registered store', () => {
    configService.useStore(memoryStore({ defaultWallet: 'main', customTokens: { x: 1 }, rpc: 'a' }))

    configService.setDefaultIndex(3)

    expect(configService.getDefaultWallet()).toBe('main')
    expect(configService.getDefaultIndex()).toBe(3)
    expect(configService.list()).toEqual({ defaultWallet: 'main', rpc: 'a', defaultIndex: 3 })
    expect(configService.configPath).toBe('memory')
  })

  it('falls back to the defaults when the stored values have the wrong type', () => {
    configService.useStore(memoryStore({ defaultWallet: 42, defaultIndex: 'one' }))

    expect(configService.getDefaultWallet()).toBe('')
    expect(configService.getDefaultIndex()).toBe(0)
  })
})
