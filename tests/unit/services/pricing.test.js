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

const getConfig = jest.fn()
const loadProtocolClass = jest.fn()
const getInstalledVersion = jest.fn()

// Mocked, not spied on: the real service reads the developer's own config file.
jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: { get: getConfig, set: jest.fn(), delete: jest.fn() }
}))

const protocolService = await import('../../../src/services/protocol-service.js')
jest.unstable_mockModule('../../../src/services/protocol-service.js', () => ({
  ...protocolService,
  loadProtocolClass
}))

const moduleService = await import('../../../src/services/module-service.js')
jest.unstable_mockModule('../../../src/services/module-service.js', () => ({
  ...moduleService,
  getInstalledVersion
}))

/** Stand-in for the SDK base class every pricing client extends. */
class PricingClient {}

/** How the SDK wrapper was constructed, captured for assertions. */
let captured

jest.unstable_mockModule('@tetherto/wdk-pricing-provider', () => ({
  PricingClient,
  PricingProvider: class {
    constructor (config) {
      captured = config
      this.getLastPrice = jest.fn()
    }
  }
}))

const require = createRequire(import.meta.url)
const catalog = require('../../../wdk.config.json')

const BITFINEX_MODULE = catalog.providers.bitfinex.module
const COINGECKO_MODULE = '@tetherto/wdk-pricing-coingecko-http'

beforeEach(() => {
  getConfig.mockReset()
  loadProtocolClass.mockReset()
  getInstalledVersion.mockReset()
  getConfig.mockReturnValue(undefined)
  getInstalledVersion.mockImplementation((m) => (m === BITFINEX_MODULE ? '1.0.0' : null))
  captured = undefined
})

/** Imports a fresh copy of the service, so its instance cache starts empty. */
async function loadPricing () {
  jest.resetModules()
  return await import('../../../src/services/pricing/index.js')
}

/** Makes the module loader return a namespace exporting the given client class. */
function withNamedExport (ClientClass) {
  loadProtocolClass.mockResolvedValue({ BitfinexPricingClient: ClientClass })
}

/** A client class that records the config it was constructed with. */
function stubClient () {
  return class extends PricingClient {
    constructor (config) {
      super()
      this.config = config
    }
  }
}

describe('resolvePricingProvider', () => {
  it('names the provider it resolved, which is also the slug key', async () => {
    withNamedExport(stubClient())
    const { resolvePricingProvider } = await loadPricing()

    const { name } = await resolvePricingProvider()

    expect(loadProtocolClass).toHaveBeenCalledWith(BITFINEX_MODULE)
    expect(name).toBe('bitfinex')
  })

  it('constructs the SDK wrapper around the client with a five-minute cache', async () => {
    const ClientClass = stubClient()
    withNamedExport(ClientClass)
    const { resolvePricingProvider } = await loadPricing()

    await resolvePricingProvider()

    expect(captured.priceCacheDurationMs).toBe(5 * 60 * 1000)
    expect(captured.client).toBeInstanceOf(ClientClass)
    expect(captured.client.config).toEqual({})
  })

  it('passes the resolved provider config to the client', async () => {
    getConfig.mockImplementation((key) =>
      key === 'providers.bitfinex.config' ? { apiKey: 'user-key' } : undefined
    )
    withNamedExport(stubClient())
    const { resolvePricingProvider } = await loadPricing()

    await resolvePricingProvider()

    expect(captured.client.config).toEqual({ apiKey: 'user-key' })
  })

  it('builds the provider once and reuses it', async () => {
    withNamedExport(stubClient())
    const { resolvePricingProvider } = await loadPricing()

    const first = await resolvePricingProvider()
    const second = await resolvePricingProvider()

    expect(second.provider).toBe(first.provider)
  })

  it('rebuilds the provider when the module now exports a different client', async () => {
    withNamedExport(stubClient())
    const { resolvePricingProvider } = await loadPricing()
    const first = await resolvePricingProvider()

    withNamedExport(stubClient())
    const second = await resolvePricingProvider()

    expect(second.provider).not.toBe(first.provider)
  })
})

describe('resolvePricingProvider client identification', () => {
  it('accepts a module that default-exports its client', async () => {
    const ClientClass = stubClient()
    loadProtocolClass.mockResolvedValue(ClientClass)
    const { resolvePricingProvider } = await loadPricing()

    await resolvePricingProvider()

    expect(captured.client).toBeInstanceOf(ClientClass)
  })

  it('picks the client out of a namespace carrying other exports', async () => {
    const ClientClass = stubClient()
    loadProtocolClass.mockResolvedValue({
      BitfinexPricingClient: ClientClass,
      buildTicker: () => 'tBTCUSD',
      DEFAULT_TIMEOUT: 5000
    })
    const { resolvePricingProvider } = await loadPricing()

    await resolvePricingProvider()

    expect(captured.client).toBeInstanceOf(ClientClass)
  })

  it('rejects a module exporting no pricing client', async () => {
    loadProtocolClass.mockResolvedValue({ buildTicker: () => 'tBTCUSD' })
    const { resolvePricingProvider } = await loadPricing()

    await expect(resolvePricingProvider()).rejects.toThrow(
      expect.objectContaining({
        message: "Provider 'bitfinex' does not export a pricing client.",
        code: 'UNSUPPORTED_MODULE',
        suggestion: 'A pricing module must export a class extending PricingClient.'
      })
    )
  })

  it('rejects a module exporting several pricing clients', async () => {
    loadProtocolClass.mockResolvedValue({ Spot: stubClient(), Futures: stubClient() })
    const { resolvePricingProvider } = await loadPricing()

    await expect(resolvePricingProvider()).rejects.toThrow(
      expect.objectContaining({
        code: 'UNSUPPORTED_MODULE',
        suggestion: 'Its module exports several; a pricing module must export exactly one.'
      })
    )
  })
})

describe('resolvePricingProvider when no single feed is usable', () => {
  it('reports no feed when the packaged one is not installed', async () => {
    getInstalledVersion.mockReturnValue(null)
    const { resolvePricingProvider } = await loadPricing()

    await expect(resolvePricingProvider()).rejects.toThrow(
      expect.objectContaining({
        message: 'No price feed is available.',
        code: 'MISSING_CONFIG'
      })
    )
  })

  it('reports no feed when the provider is disabled', async () => {
    getConfig.mockImplementation((key) =>
      key === 'overrides' ? { providers: { bitfinex: { enabled: false } } } : undefined
    )
    const { resolvePricingProvider } = await loadPricing()

    await expect(resolvePricingProvider()).rejects.toThrow('No price feed is available.')
  })

  it('refuses to guess when two feeds are enabled at once', async () => {
    getConfig.mockImplementation((key) =>
      key === 'customProviders'
        ? { coingecko: { kind: 'pricing', module: COINGECKO_MODULE } }
        : undefined
    )
    getInstalledVersion.mockReturnValue('1.0.0')
    const { resolvePricingProvider } = await loadPricing()

    await expect(resolvePricingProvider()).rejects.toThrow(
      expect.objectContaining({
        message: 'Several price feeds are enabled: bitfinex, coingecko.',
        code: 'INVALID_ARGUMENT',
        suggestion: 'Only one runs at a time. Disable the others with: wdk provider disable --name <name>'
      })
    )
  })

  it('does not load a module when no feed resolves', async () => {
    getInstalledVersion.mockReturnValue(null)
    const { resolvePricingProvider } = await loadPricing()

    await expect(resolvePricingProvider()).rejects.toThrow('No price feed is available.')
    expect(loadProtocolClass).not.toHaveBeenCalled()
  })
})
