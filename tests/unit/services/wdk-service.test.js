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

import { jest } from '@jest/globals'
import { mnemonicToSeedSync } from 'bip39'

const disposed = { count: 0 }
const getConfig = jest.fn()

jest.unstable_mockModule('@tetherto/wdk', () => ({
  default: class WDK {
    constructor (seed) {
      this._seed = seed
    }

    dispose () {
      disposed.count++
    }
  }
}))

// Mocked, not spied on: the real service reads the developer's own config file.
jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: { get: getConfig, set: jest.fn(), delete: jest.fn() }
}))

const { WdkService } = await import('../../../src/services/wdk-service.js')

const MNEMONIC =
  'cook voyage document eight skate token alien guide drink uncle term abuse'
const EVIL_NETWORK = 'evilnet'

describe('WdkService seed memory', () => {
  beforeEach(() => {
    disposed.count = 0
    getConfig.mockReset()
  })

  it('retains the seed Buffer by reference (no copy)', () => {
    const seed = mnemonicToSeedSync(MNEMONIC)
    const svc = new WdkService()
    svc.createInstance(seed)
    expect(svc.seed).toBe(seed)
  })

  it('zeros the seed Buffer on dispose', () => {
    const seed = mnemonicToSeedSync(MNEMONIC)
    const svc = new WdkService()
    svc.createInstance(seed)

    svc.dispose()

    expect(seed).toEqual(Buffer.alloc(64))
    expect(svc.seed).toBeNull()
    expect(svc.wdk).toBeNull()
    expect(disposed.count).toBe(1)
  })

  it('does not retain or scrub a non-Buffer (mnemonic string) seed', () => {
    const svc = new WdkService()
    svc.createInstance(MNEMONIC)
    expect(svc.seed).toBeNull()
    expect(() => svc.dispose()).not.toThrow()
  })

  it('dispose is a no-op when no instance was created', () => {
    const svc = new WdkService()
    expect(() => svc.dispose()).not.toThrow()
    expect(disposed.count).toBe(0)
  })
})

describe('WdkService wallet module loading', () => {
  beforeEach(() => {
    getConfig.mockReset()
  })

  it.each([
    ['an absolute path', '/tmp/evil.mjs'],
    ['a file URL', 'file:///tmp/evil.mjs'],
    ['a data URL', 'data:text/javascript,globalThis.pwned=1'],
    ['an unregistered package', '@nope/unregistered']
  ])('refuses to load %s as a wallet module', async (_label, specifier) => {
    getConfig.mockImplementation((key) =>
      key === 'customNetworks'
        ? {
            [EVIL_NETWORK]: {
              name: EVIL_NETWORK,
              displayName: 'Evil',
              type: specifier,
              module: specifier,
              custom: true,
              testnet: false
            }
          }
        : undefined
    )
    const svc = new WdkService()
    svc.createInstance(MNEMONIC)

    await expect(svc.getAccount(EVIL_NETWORK, 0)).rejects.toThrow(
      expect.objectContaining({
        message: `Wallet module '${specifier}' is not registered.`,
        code: 'UNSUPPORTED_MODULE'
      })
    )

    expect(getConfig).toHaveBeenCalledWith('customNetworks')
  })
})
