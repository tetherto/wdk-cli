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
import { createHmac } from 'node:crypto'

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

const { resolveRampProvider, resolveAssets, quoteRamp, buildRampUrl, buildModuleConfig } =
  await import('../../../src/services/ramp-service.js')

const require = createRequire(import.meta.url)
const catalog = require('../../../wdk.config.json')

const MOONPAY_MODULE = catalog.providers.moonpay.module

/** How the stub module was constructed, captured for assertions. */
let captured

/**
 * The packaged entry ships `environment: ""`, which the module contract treats
 * as unset. Tests that are not about that supply a value, as a user must.
 */
const CONFIGURED = { 'providers.moonpay.config': { environment: 'sandbox' } }

beforeEach(() => {
  getConfig.mockReset()
  loadProtocolClass.mockReset()
  getInstalledVersion.mockReset()
  withConfig({})
  getInstalledVersion.mockImplementation((m) => (m === MOONPAY_MODULE ? '1.0.0' : null))
  captured = undefined
})

/** Mocks config reads so only the listed keys answer, over a configured environment. */
function withConfig (values) {
  const merged = { ...CONFIGURED, ...values }
  getConfig.mockImplementation((key) => (Object.hasOwn(merged, key) ? merged[key] : undefined))
}

/** Makes the module loader return a class that records its construction. */
function withModule (methods = {}) {
  loadProtocolClass.mockResolvedValue(class {
    constructor (account, config) {
      captured = { account, config }
      Object.assign(this, methods)
    }
  })
}

/** A module answering both listings with nothing. */
const EMPTY_LISTINGS = {
  getSupportedCryptoAssets: async () => [],
  getSupportedFiatCurrencies: async () => []
}

describe('provider availability', () => {
  it('uses the only provider whose module is installed', () => {
    expect(resolveRampProvider()).toBe('moonpay')
  })

  it('reports none available when the module is missing', () => {
    getInstalledVersion.mockReturnValue(null)

    expect(() => resolveRampProvider()).toThrow('No fiat provider is available.')
  })

  it('reports none available when every shipped provider is disabled', () => {
    withConfig({ overrides: { providers: { moonpay: { enabled: false } } } })

    expect(() => resolveRampProvider()).toThrow(
      expect.objectContaining({
        message: 'No fiat provider is available.',
        code: 'MISSING_CONFIG'
      })
    )
  })
})

describe('resolveRampProvider', () => {
  it('returns the named provider', () => {
    expect(resolveRampProvider('moonpay')).toBe('moonpay')
  })

  it('refuses a provider of another kind', () => {
    expect(() => resolveRampProvider('velora')).toThrow(
      expect.objectContaining({
        message: "Provider 'velora' is not a fiat on/off-ramp.",
        code: 'INVALID_ARGUMENT'
      })
    )
  })

  it('reports when none is usable', () => {
    getInstalledVersion.mockReturnValue(null)

    expect(() => resolveRampProvider()).toThrow(
      expect.objectContaining({
        message: 'No fiat provider is available.',
        code: 'MISSING_CONFIG'
      })
    )
  })

  it('loads the provider module named by the registry', async () => {
    withModule(EMPTY_LISTINGS)

    await resolveAssets('moonpay', 'sepolia', 'eth', 'usd').catch(() => {})

    expect(loadProtocolClass).toHaveBeenCalledWith(MOONPAY_MODULE)
  })
})

describe('token resolution', () => {
  it('resolves the packaged slug and both sides decimals', async () => {
    withModule({
      getSupportedCryptoAssets: async () => [{ code: 'usdt_trx', decimals: 6 }],
      getSupportedFiatCurrencies: async () => [{ code: 'usd', decimals: 2 }]
    })

    const resolved = await resolveAssets('moonpay', 'tron', 'usdt', 'usd')

    expect(resolved).toEqual({
      cryptoCode: 'usdt_trx', cryptoDecimals: 6, fiatCode: 'usd', fiatDecimals: 2
    })
  })

  it('matches a fiat code whose case differs from the request', async () => {
    withModule({
      getSupportedCryptoAssets: async () => [{ code: 'usdt_trx', decimals: 6 }],
      getSupportedFiatCurrencies: async () => [{ code: 'USD', decimals: 2 }]
    })

    const resolved = await resolveAssets('moonpay', 'tron', 'usdt', 'usd')

    expect(resolved).toEqual({
      cryptoCode: 'usdt_trx', cryptoDecimals: 6, fiatCode: 'USD', fiatDecimals: 2
    })
  })

  it('refuses a token with no mapping, naming what the provider does carry', async () => {
    withModule(EMPTY_LISTINGS)

    await expect(
      resolveAssets('moonpay', 'avalanche', 'usdt', 'usd')
    ).rejects.toThrow(
      expect.objectContaining({
        message: "Token 'usdt' on 'avalanche' has no moonpay mapping.",
        code: 'TOKEN_NOT_SUPPORTED'
      })
    )
  })

  it('refuses a token that is not registered', async () => {
    withModule(EMPTY_LISTINGS)

    await expect(
      resolveAssets('moonpay', 'ethereum', 'nope', 'usd')
    ).rejects.toThrow("Unknown token 'nope' on 'ethereum'.")
  })

  it('applies a user slug override', async () => {
    withConfig({
      overrides: { tokens: { 'ethereum/eth': { metadata: { slugs: { moonpay: 'eth_override' } } } } }
    })
    withModule({
      getSupportedCryptoAssets: async () => [{ code: 'eth_override', decimals: 18 }],
      getSupportedFiatCurrencies: async () => [{ code: 'usd', decimals: 2 }]
    })

    const resolved = await resolveAssets('moonpay', 'ethereum', 'eth', 'usd')

    expect(resolved).toEqual({
      cryptoCode: 'eth_override', cryptoDecimals: 18, fiatCode: 'usd', fiatDecimals: 2
    })
  })

  it('refuses an asset the provider does not list', async () => {
    withModule({
      getSupportedCryptoAssets: async () => [{ code: 'something_else', decimals: 6 }],
      getSupportedFiatCurrencies: async () => [{ code: 'usd', decimals: 2 }]
    })

    await expect(
      resolveAssets('moonpay', 'tron', 'usdt', 'usd')
    ).rejects.toThrow("Asset 'usdt_trx' is not supported by moonpay.")
  })
})

/** A provider listing the same code on two networks, each with its own decimals. */
const AMBIGUOUS_LISTING = {
  getSupportedCryptoAssets: async () => [
    { code: 'usdt_trx', decimals: 6, networkCode: 'tron' },
    { code: 'usdt_trx', decimals: 18, networkCode: 'bsc' }
  ],
  getSupportedFiatCurrencies: async () => [{ code: 'usd', decimals: 2 }]
}

/** Mocks a slug override for tron/usdt. */
const withSlug = (slug) => withConfig({
  overrides: { tokens: { 'tron/usdt': { metadata: { slugs: { moonpay: slug } } } } },
  'providers.moonpay.config': { environment: 'sandbox', apiKey: 'k' }
})

describe('picking the listing row', () => {
  it('uses the network in the mapping to choose between rows', async () => {
    withSlug({ slug: 'usdt_trx', network: 'tron' })
    withModule(AMBIGUOUS_LISTING)

    const resolved = await resolveAssets('moonpay', 'tron', 'usdt', 'usd')

    expect(resolved.cryptoDecimals).toBe(6)
  })

  it('refuses an ambiguous code when the mapping names no network', async () => {
    withSlug('usdt_trx')
    withModule(AMBIGUOUS_LISTING)

    await expect(
      resolveAssets('moonpay', 'tron', 'usdt', 'usd')
    ).rejects.toThrow(
      expect.objectContaining({
        message: "moonpay lists 'usdt_trx' on 2 networks, so the mapping must name one.",
        code: 'TOKEN_NOT_SUPPORTED'
      })
    )
  })

  it('refuses a network the provider does not list the code on', async () => {
    withSlug({ slug: 'usdt_trx', network: 'polygon' })
    withModule(AMBIGUOUS_LISTING)

    await expect(
      resolveAssets('moonpay', 'tron', 'usdt', 'usd')
    ).rejects.toThrow("moonpay does not list 'usdt_trx' on network 'polygon'.")
  })
})

describe('quote and buildUrl', () => {
  const INPUT = {
    network: 'tron',
    token: 'usdt',
    walletAddress: 'TWallet1',
    fiatCurrency: 'usd',
    fiatCode: 'USD',
    fiatAmount: 10000n,
    fiatDecimals: 2,
    cryptoDecimals: 6
  }
  const DUMMY_QUOTE = { fiatAmount: 10000n, cryptoAmount: 34n, fee: 420n, rate: '2840.44' }

  it('sends the provider slug, its spelling of the currency, and the amount', async () => {
    const quoteBuy = jest.fn().mockResolvedValue(DUMMY_QUOTE)
    withModule({ ...EMPTY_LISTINGS, quoteBuy })

    const { quote } = await quoteRamp('moonpay', INPUT, 'buy')

    expect(quoteBuy).toHaveBeenCalledWith({
      cryptoAsset: 'usdt_trx', fiatCurrency: 'USD', fiatAmount: 10000n
    })
    expect(quote).toEqual(DUMMY_QUOTE)
  })

  it('prices a sale with quoteSell', async () => {
    const quoteSell = jest.fn().mockResolvedValue(DUMMY_QUOTE)
    withModule({ ...EMPTY_LISTINGS, quoteSell })

    await quoteRamp('moonpay', { ...INPUT, fiatAmount: undefined, cryptoAmount: 50n }, 'sell')

    expect(quoteSell).toHaveBeenCalledWith({
      cryptoAsset: 'usdt_trx', fiatCurrency: 'USD', cryptoAmount: 50n
    })
  })

  it('reports why the provider could not price it, rather than failing', async () => {
    withModule({ ...EMPTY_LISTINGS, quoteBuy: async () => { throw new Error('no liquidity') } })

    const { quote, reason } = await quoteRamp('moonpay', INPUT, 'buy')

    expect(quote).toBeUndefined()
    expect(reason).toBe('no liquidity')
  })

  it('names the wallet as recipient on a buy', async () => {
    const buy = jest.fn().mockResolvedValue({ buyUrl: 'https://buy' })
    withModule({ ...EMPTY_LISTINGS, buy })

    const { url } = await buildRampUrl('moonpay', INPUT, 'buy')

    expect(buy).toHaveBeenCalledWith({
      cryptoAsset: 'usdt_trx', fiatCurrency: 'USD', fiatAmount: 10000n, recipient: 'TWallet1'
    })
    expect(url).toBe('https://buy')
  })

  it('names the wallet as refund address on a sell', async () => {
    const sell = jest.fn().mockResolvedValue({ sellUrl: 'https://sell' })
    withModule({ ...EMPTY_LISTINGS, sell })

    const { url } = await buildRampUrl('moonpay', 
      { ...INPUT, fiatAmount: undefined, cryptoAmount: 50n }, 'sell'
    )

    expect(sell).toHaveBeenCalledWith({
      cryptoAsset: 'usdt_trx', fiatCurrency: 'USD', cryptoAmount: 50n, refundAddress: 'TWallet1'
    })
    expect(url).toBe('https://sell')
  })

  it("forwards a slug's extra fields as the call config", async () => {
    withSlug({ slug: 'usdt_trx', network: 'tron' })
    const buy = jest.fn().mockResolvedValue({ buyUrl: 'https://buy' })
    withModule({ ...EMPTY_LISTINGS, buy })

    await buildRampUrl('moonpay', INPUT, 'buy')

    expect(buy).toHaveBeenCalledWith(expect.objectContaining({ config: { network: 'tron' } }))
  })
})

describe('module config', () => {
  it('wraps a configured callback key into a function', () => {
    withConfig({ 'providers.moonpay.config': { apiKey: 'k', environment: 'sandbox', signUrl: 'https://sign.example/sign' } })

    const config = buildModuleConfig('moonpay', 'ethereum')

    expect(config).toEqual({ apiKey: 'k', environment: 'sandbox', signUrl: expect.any(Function) })
  })

  it('drops a callback key with no endpoint, so the module sees it as absent', () => {
    withConfig({ 'providers.moonpay.config': { apiKey: 'k', environment: 'sandbox' } })

    const config = buildModuleConfig('moonpay', 'ethereum')

    expect(config).toEqual({ apiKey: 'k', environment: 'sandbox' })
  })

  it('passes non-callback values through untouched', () => {
    withConfig({ 'providers.moonpay.config': { apiKey: 'k', environment: 'sandbox', cacheTime: 1000 } })

    const config = buildModuleConfig('moonpay', 'ethereum')

    expect(config.cacheTime).toBe(1000)
    expect(config.apiKey).toBe('k')
  })

  it('wraps every callback key a provider entry declares, including a user-added one', () => {
    withConfig({
      'providers.transak.config': { apiKey: 'k', environment: 'STAGING', widgetUrl: 'https://w.test', getOrder: 'https://o.test' },
      customProviders: {
        transak: {
          kind: 'fiat',
          module: '@transak/wdk-protocol-fiat-transak',
          endpointKeys: ['widgetUrl', 'getOrder']
        }
      }
    })

    const config = buildModuleConfig('transak', 'ethereum')

    expect(config.widgetUrl).toEqual(expect.any(Function))
    expect(config.getOrder).toEqual(expect.any(Function))
  })

  it('passes the environment through without judging it against the network', () => {
    withConfig({ 'providers.moonpay.config': { apiKey: 'k', environment: 'production' } })

    expect(buildModuleConfig('moonpay', 'sepolia').environment).toBe('production')
  })
})

describe('endpoint callbacks', () => {
  const SIGN_URL = 'http://localhost:3456/sign'
  const SECRET = 'sk_test_DUMMY'
  const UNSIGNED = 'https://buy-sandbox.moonpay.com?apiKey=pk_test_X&currencyCode=usdt_trx'
  const EXPECTED_SIGNATURE = createHmac('sha256', SECRET)
    .update('?apiKey=pk_test_X&currencyCode=usdt_trx').digest('base64')

  /** Records the request the CLI made to the endpoint. */
  let request

  /** Stands in for `examples/moonpay-sign-server.mjs`, implementing its contract. */
  const signServer = async (url, init) => {
    request = { url, body: JSON.parse(init.body) }
    const target = request.body.urlForSignature
    if (typeof target !== 'string' || !target) {
      return { ok: false, status: 400, statusText: 'Bad Request', json: async () => ({}) }
    }
    const signature = createHmac('sha256', SECRET).update(new URL(target).search).digest('base64')
    return { ok: true, json: async () => ({ signedUrl: `${target}&signature=${encodeURIComponent(signature)}` }) }
  }

  /** Constructs MoonPay with a signUrl and hands back the wrapped callback. */
  async function signCallback () {
    withModule(EMPTY_LISTINGS)
    withConfig({ 'providers.moonpay.config': { environment: 'sandbox', apiKey: 'pk_test_X', signUrl: SIGN_URL } })
    await resolveAssets('moonpay', 'ethereum', 'eth', 'usd').catch(() => {})
    return captured.config.signUrl
  }

  beforeEach(() => {
    request = undefined
  })

  it('POSTs the URL under the field a MoonPay sign server expects', async () => {
    globalThis.fetch = signServer
    const sign = await signCallback()

    const signed = await sign(UNSIGNED)

    expect(request.url).toBe(SIGN_URL)
    expect(request.body).toEqual({ urlForSignature: UNSIGNED })
    expect(signed).toBe(`${UNSIGNED}&signature=${encodeURIComponent(EXPECTED_SIGNATURE)}`)
  })

  it('reports an unreachable endpoint rather than failing inside the module', async () => {
    globalThis.fetch = async () => { throw new Error('connect ECONNREFUSED') }
    const sign = await signCallback()

    await expect(sign(UNSIGNED)).rejects.toThrow(
      expect.objectContaining({
        message: `Cannot reach endpoint '${SIGN_URL}': connect ECONNREFUSED`,
        code: 'SIGN_FAILED'
      })
    )
  })

  it('reports a non-OK answer', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500, statusText: 'Server Error', text: async () => '' })
    const sign = await signCallback()

    await expect(sign(UNSIGNED)).rejects.toThrow(`Endpoint '${SIGN_URL}' failed: 500 Server Error`)
  })

  it('carries the reason the endpoint gave, rather than only its status', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => JSON.stringify({ error: 'API key is not active. Please complete the KYC.' })
    })
    const sign = await signCallback()

    await expect(sign(UNSIGNED)).rejects.toThrow(
      `Endpoint '${SIGN_URL}' failed: 502 Bad Gateway — API key is not active. Please complete the KYC.`
    )
  })

  it('falls back to the raw body when it is not JSON', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500, statusText: 'Server Error', text: async () => 'upstream down' })
    const sign = await signCallback()

    await expect(sign(UNSIGNED)).rejects.toThrow(
      `Endpoint '${SIGN_URL}' failed: 500 Server Error — upstream down`
    )
  })

  it('hands back an answer carrying no URL field as-is, for callbacks that want an object', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ orderId: 'o-1', status: 'COMPLETED' }) })
    const sign = await signCallback()

    await expect(sign(UNSIGNED)).resolves.toEqual({ orderId: 'o-1', status: 'COMPLETED' })
  })
})
