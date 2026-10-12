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
import { createRequire } from 'node:module'

const loadProtocolClass = jest.fn()

// Mocked, not spied on: the real service reads the developer's own config file.
jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: { get: jest.fn(), set: jest.fn(), delete: jest.fn() }
}))

const actualService = await import('../../../src/services/protocol-service.js')
jest.unstable_mockModule('../../../src/services/protocol-service.js', () => ({
  ...actualService,
  loadProtocolClass
}))

const { resolveCandidates } = await import('../../../src/services/swap-orchestrator.js')
const { WdkCliError, ErrorCode } = await import('../../../src/errors/index.js')

const require = createRequire(import.meta.url)
const catalog = require('../../../wdk.config.json')

/** A class with no quote methods at all: the kind must come from the registry, not from it. */
class Opaque {}

const notInstalled = (module) =>
  new WdkCliError(`Module '${module}' is not installed.`, ErrorCode.UNSUPPORTED_MODULE)

beforeEach(() => {
  loadProtocolClass.mockReset()
  loadProtocolClass.mockResolvedValue(Opaque)
})

describe('resolveCandidates', () => {
  it('quotes the protocols declared swap or swidge for a swap, with the declared kind', async () => {
    const candidates = await resolveCandidates('swap')

    expect(candidates).toEqual([
      { name: 'velora', kind: 'swap', ProtocolClass: Opaque },
      { name: 'rhinofi', kind: 'swidge', ProtocolClass: Opaque },
      { name: 'symbiosis', kind: 'swidge', ProtocolClass: Opaque }
    ])
    expect(loadProtocolClass).toHaveBeenCalledWith(catalog.providers.velora.module)
    expect(loadProtocolClass).toHaveBeenCalledWith(catalog.providers.rhinofi.module)
    expect(loadProtocolClass).toHaveBeenCalledWith(catalog.providers.symbiosis.module)
  })

  it('quotes the protocols declared bridge or swidge for a bridge', async () => {
    const candidates = await resolveCandidates('bridge')

    expect(candidates).toEqual([
      { name: 'usdt0', kind: 'bridge', ProtocolClass: Opaque },
      { name: 'rhinofi', kind: 'swidge', ProtocolClass: Opaque },
      { name: 'symbiosis', kind: 'swidge', ProtocolClass: Opaque }
    ])
  })

  it('never imports a protocol whose declared kind cannot serve the request', async () => {
    await resolveCandidates('swap')

    expect(loadProtocolClass).not.toHaveBeenCalledWith(catalog.providers.usdt0.module)
    expect(loadProtocolClass).toHaveBeenCalledTimes(3)
  })

  it('skips a protocol whose module is not installed', async () => {
    loadProtocolClass.mockImplementation(async (module) => {
      if (module === catalog.providers.velora.module) throw notInstalled(module)
      return Opaque
    })

    const candidates = await resolveCandidates('swap')

    expect(candidates).toEqual([
      { name: 'rhinofi', kind: 'swidge', ProtocolClass: Opaque },
      { name: 'symbiosis', kind: 'swidge', ProtocolClass: Opaque }
    ])
  })

  it('throws when no protocol declared for the request kind is installed', async () => {
    loadProtocolClass.mockImplementation(async (module) => { throw notInstalled(module) })

    await expect(resolveCandidates('swap')).rejects.toThrow('No installed protocol can swap.')
  })

  it('forces a named protocol with its declared kind', async () => {
    const candidates = await resolveCandidates('swap', 'rhinofi')

    expect(candidates).toEqual([{ name: 'rhinofi', ProtocolClass: Opaque, kind: 'swidge' }])
  })

  it('rejects a forced protocol declared for another kind before importing it', async () => {
    await expect(resolveCandidates('swap', 'usdt0')).rejects.toThrow(
      expect.objectContaining({
        message: "Protocol 'usdt0' cannot swap.",
        suggestion: 'It is a bridge protocol.'
      })
    )
    expect(loadProtocolClass).not.toHaveBeenCalled()
  })
})
