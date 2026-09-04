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

import { createRequire } from 'node:module'

import {
  getProtocols,
  getProtocol,
  resolveProtocolConfig,
  detectKind,
  servesRequest
} from '../../../src/services/protocol-service.js'

const require = createRequire(import.meta.url)
const catalog = require('../../../wdk.config.json')

const SWAP_CLASS = { prototype: { swap () {}, quoteSwap () {} } }
const BRIDGE_CLASS = { prototype: { bridge () {}, quoteBridge () {} } }
const SWIDGE_CLASS = { prototype: { swidge () {}, quoteSwidge () {}, quoteSwap () {}, quoteBridge () {} } }

describe('getProtocols', () => {
  it('returns the protocols declared in wdk.config.json', () => {
    expect(getProtocols()).toEqual(catalog.protocols)
  })
})

describe('getProtocol', () => {
  it('returns a catalog protocol entry', () => {
    expect(getProtocol('velora')).toEqual(catalog.protocols.velora)
  })

  it('rejects an unknown protocol with the available list', () => {
    expect(() => getProtocol('nope')).toThrow("Unknown protocol 'nope'.")
  })
})

describe('resolveProtocolConfig', () => {
  it('returns the protocol general config when there is no per-network override', () => {
    expect(resolveProtocolConfig('velora', 'ethereum')).toEqual(catalog.protocols.velora.config)
  })
})

describe('detectKind', () => {
  it('detects swap from quoteSwap', () => {
    expect(detectKind(SWAP_CLASS)).toBe('swap')
  })

  it('detects bridge from quoteBridge', () => {
    expect(detectKind(BRIDGE_CLASS)).toBe('bridge')
  })

  it('detects swidge from quoteSwidge even though swap/bridge are also present', () => {
    expect(detectKind(SWIDGE_CLASS)).toBe('swidge')
  })

  it('returns null when no quote method is present', () => {
    expect(detectKind({ prototype: {} })).toBe(null)
  })
})

describe('servesRequest', () => {
  it('lets a swidge protocol serve both swap and bridge requests', () => {
    expect(servesRequest('swidge', 'swap')).toBe(true)
    expect(servesRequest('swidge', 'bridge')).toBe(true)
  })

  it('lets a swap protocol serve only swap requests', () => {
    expect(servesRequest('swap', 'swap')).toBe(true)
    expect(servesRequest('swap', 'bridge')).toBe(false)
  })

  it('lets a bridge protocol serve only bridge requests', () => {
    expect(servesRequest('bridge', 'bridge')).toBe(true)
    expect(servesRequest('bridge', 'swap')).toBe(false)
  })
})
