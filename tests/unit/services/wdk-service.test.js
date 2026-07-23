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

const { WdkService } = await import('../../../src/services/wdk-service.js')

const MNEMONIC =
  'cook voyage document eight skate token alien guide drink uncle term abuse'

describe('WdkService seed memory', () => {
  beforeEach(() => {
    disposed.count = 0
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
