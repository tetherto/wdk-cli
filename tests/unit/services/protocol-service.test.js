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
const setConfig = jest.fn()
const deleteConfig = jest.fn()

// Mocked, not spied on: the real service reads the developer's own config file.
jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: { get: getConfig, set: setConfig, delete: deleteConfig }
}))

const {
  getProtocols,
  getProtocolsByKind,
  getProtocol,
  getProtocolsIncludingDisabled,
  resolveProtocolConfig,
  getProviderNetworks,
  assertImplementsKind,
  PROTOCOL_KINDS,
  loadProtocolClass,
  isProviderDisabled,
  setProviderEnabled,
  servesRequest
} = await import('../../../src/services/protocol-service.js')

const require = createRequire(import.meta.url)
const catalog = require('../../../wdk.config.json')

const PACKAGED_NAMES = Object.keys(catalog.providers)
const CUSTOM_MODULE = '@tetherto/wdk-wallet-ton'
const VELORA_MODULE = catalog.providers.velora.module

beforeEach(() => {
  getConfig.mockReset()
  setConfig.mockReset()
  deleteConfig.mockReset()
  getConfig.mockReturnValue(undefined)
})

/**
 * Mocks config reads from a map of exact dot-path key to value, so each test
 * declares only the keys the code under test reads.
 *
 * @param {Record<string, unknown>} values
 */
function withConfig (values) {
  getConfig.mockImplementation((key) => (Object.hasOwn(values, key) ? values[key] : undefined))
}

describe('the packaged provider registry', () => {
  // The CLI resolves these kinds by kind, not by name, and refuses to guess
  // between two. Shipping a second one is a release bug, not a user error.
  it.each([
    ['indexer', ['wdk-indexer']],
    ['pricing', ['bitfinex']]
  ])('registers exactly one %s provider', (kind, expected) => {
    const names = Object.entries(catalog.providers)
      .filter(([, entry]) => entry.kind === kind)
      .map(([name]) => name)

    expect(names).toEqual(expected)
  })

  it('declares a known kind on every entry', () => {
    for (const entry of Object.values(catalog.providers)) {
      expect(PROTOCOL_KINDS).toContain(entry.kind)
    }
  })
})

describe('getProtocols', () => {
  it('returns the providers declared in wdk.config.json, each with a declared kind', () => {
    const protocols = getProtocols()

    expect(protocols).toEqual(catalog.providers)
    expect(protocols.velora.kind).toBe('swap')
    expect(protocols.usdt0.kind).toBe('bridge')
    expect(protocols.rhinofi.kind).toBe('swidge')
    expect(protocols.symbiosis.kind).toBe('swidge')
  })
})

describe('getProtocolsByKind', () => {
  it('returns swap and swidge protocols for a swap request', () => {
    expect(Object.keys(getProtocolsByKind('swap'))).toEqual(['velora', 'rhinofi', 'symbiosis'])
  })

  it('returns bridge and swidge protocols for a bridge request', () => {
    expect(Object.keys(getProtocolsByKind('bridge'))).toEqual(['usdt0', 'rhinofi', 'symbiosis'])
  })

  it('never routes a fiat provider to swap or bridge', () => {
    expect(Object.keys(getProtocolsByKind('swap'))).not.toContain('moonpay')
    expect(Object.keys(getProtocolsByKind('bridge'))).not.toContain('moonpay')
  })
})

describe('getProtocol', () => {
  it('returns a catalog protocol entry', () => {
    expect(getProtocol('velora')).toEqual(catalog.providers.velora)
  })

  it('rejects an unknown protocol with the available list', () => {
    expect(() => getProtocol('nope')).toThrow("Unknown protocol 'nope'.")
  })

  it.each(['constructor', 'toString', '__proto__'])(
    'rejects the inherited object property %s as a protocol name', (name) => {
      expect(() => getProtocol(name)).toThrow(`Unknown protocol '${name}'.`)
    }
  )
})

describe('resolveProtocolConfig', () => {
  it('returns the protocol general config when there is no per-network override', () => {
    expect(resolveProtocolConfig('velora', 'ethereum')).toEqual(catalog.providers.velora.config)
  })

  it('merges the per-network protocol override over the general config', () => {
    expect(resolveProtocolConfig('symbiosis', 'ethereum')).toEqual({ partnerId: 'wdk', chain: 1 })
  })
})

describe('resolveProtocolConfig user layers', () => {
  it('merges the user general config over the packaged one', () => {
    withConfig({ 'providers.rhinofi.config': { apiKey: 'user-key' } })

    expect(resolveProtocolConfig('rhinofi')).toEqual({ apiKey: 'user-key' })
  })

  it('returns only the general layers when no network is given', () => {
    withConfig({ 'providers.symbiosis.config': { apiKey: 'user-key' } })

    expect(resolveProtocolConfig('symbiosis')).toEqual({ partnerId: 'wdk', apiKey: 'user-key' })
  })

  it('lets the user per-network layer win over every other layer', () => {
    withConfig({
      'providers.symbiosis.config': { partnerId: 'user-general', slippage: 1 },
      'providers.symbiosis.networks.ethereum': { partnerId: 'user-ethereum', chain: 99 }
    })

    expect(resolveProtocolConfig('symbiosis', 'ethereum')).toEqual({
      partnerId: 'user-ethereum',
      slippage: 1,
      chain: 99
    })
  })

  it('applies the user general layer on a network with no override of its own', () => {
    withConfig({ 'providers.symbiosis.config': { apiKey: 'user-key' } })

    expect(resolveProtocolConfig('symbiosis', 'polygon')).toEqual({
      partnerId: 'wdk',
      apiKey: 'user-key',
      chain: 137
    })
  })

  it('configures a network the packaged file says nothing about', () => {
    withConfig({ 'providers.velora.networks.bsc': { swapMaxFee: 42 } })

    expect(resolveProtocolConfig('velora', 'bsc')).toEqual({ swapMaxFee: 42 })
    expect(resolveProtocolConfig('velora', 'ethereum')).toEqual({})
  })

  it('ignores a user value that is not an object', () => {
    withConfig({ 'providers.symbiosis.config': 'oops' })

    expect(resolveProtocolConfig('symbiosis', 'ethereum')).toEqual({ partnerId: 'wdk', chain: 1 })
  })

  it('resolves a disabled protocol only when asked', () => {
    withConfig({ overrides: { modules: { [catalog.providers.velora.module]: { enabled: false } } } })

    expect(() => resolveProtocolConfig('velora', 'ethereum')).toThrow("Protocol 'velora' is disabled.")
    expect(resolveProtocolConfig('velora', 'ethereum', { includeDisabled: true })).toEqual({})
  })

  it('reports an unknown protocol when resolving a disabled one', () => {
    withConfig({})

    expect(() => resolveProtocolConfig('nope', 'ethereum', { includeDisabled: true })).toThrow(
      "Unknown protocol 'nope'."
    )
  })
})

describe('getProviderNetworks', () => {
  /** The networks whose packaged entry carries a symbiosis override, in file order. */
  const SYMBIOSIS_NETWORKS = ['ethereum', 'polygon', 'arbitrum', 'base', 'bsc', 'avalanche']

  it('lists the packaged networks, then the ones the user configured', () => {
    withConfig({ 'providers.symbiosis.networks': { optimism: { chain: 10 } } })

    expect(getProviderNetworks('symbiosis', catalog.providers.symbiosis)).toEqual([
      ...SYMBIOSIS_NETWORKS,
      'optimism'
    ])
  })

  it('lists the packaged networks alone when the user configured none', () => {
    withConfig({})

    expect(getProviderNetworks('symbiosis', catalog.providers.symbiosis)).toEqual(SYMBIOSIS_NETWORKS)
  })

  it('lists a custom entry own networks', () => {
    withConfig({})

    const entry = { kind: 'swidge', module: CUSTOM_MODULE, networks: { ethereum: {}, optimism: {} } }

    expect(getProviderNetworks('lifi', entry)).toEqual(['ethereum', 'optimism'])
  })
})

describe('assertImplementsKind', () => {
  const classWith = (...methods) => {
    const Cls = class {}
    for (const method of methods) Cls.prototype[method] = () => {}
    return Cls
  }

  it.each([
    ['swap', ['quoteSwap', 'swap']],
    ['bridge', ['quoteBridge', 'bridge']],
    ['swidge', ['quoteSwidge', 'swidge']]
  ])('accepts a class implementing the declared kind %s', (kind, methods) => {
    expect(() => assertImplementsKind('x', kind, classWith(...methods))).not.toThrow()
  })

  it('names the missing methods and the kind the module does implement', () => {
    expect(() => assertImplementsKind('lifi', 'swap', classWith('quoteBridge', 'bridge'))).toThrow(
      expect.objectContaining({
        message: "Provider 'lifi' is declared swap, but its module does not implement quoteSwap and swap.",
        suggestion: 'Its module implements bridge. Register it with one of those kinds.'
      })
    )
  })

  it('accepts a class implementing the declared kind fiat', () => {
    const fiat = classWith('quoteBuy', 'buy', 'quoteSell', 'sell')

    expect(() => assertImplementsKind('moonpay', 'fiat', fiat)).not.toThrow()
  })

  it('refuses a swap class declared fiat', () => {
    expect(() => assertImplementsKind('x', 'fiat', classWith('quoteSwap', 'swap'))).toThrow(
      "Provider 'x' is declared fiat, but its module does not implement quoteBuy and buy and quoteSell and sell."
    )
  })

  it('names only the method that is missing when the class is half-implemented', () => {
    expect(() => assertImplementsKind('lifi', 'swap', classWith('quoteSwap'))).toThrow(
      "Provider 'lifi' is declared swap, but its module does not implement swap."
    )
  })

  it('reports a class that implements no protocol interface', () => {
    expect(() => assertImplementsKind('lifi', 'swap', classWith())).toThrow(
      expect.objectContaining({
        suggestion: 'Its module implements none of: swap, bridge, swidge, fiat, pricing.'
      })
    )
  })

  it('accepts a swidge class declared swidge even though it also swaps and bridges', () => {
    const swidge = classWith('quoteSwidge', 'swidge', 'quoteSwap', 'swap', 'quoteBridge', 'bridge')

    expect(() => assertImplementsKind('x', 'swidge', swidge)).not.toThrow()
  })
})

describe('loadProtocolClass', () => {
  it.each([
    ['an absolute path', '/tmp/evil.mjs'],
    ['a relative path', './evil.mjs'],
    ['a file URL', 'file:///tmp/evil.mjs'],
    ['a data URL', 'data:text/javascript,globalThis.pwned=1'],
    ['an unregistered package', '@nope/unregistered']
  ])('refuses to import %s', async (_label, specifier) => {
    withConfig({})

    await expect(loadProtocolClass(specifier)).rejects.toThrow(
      expect.objectContaining({
        message: `Module '${specifier}' is not registered.`,
        code: 'UNSUPPORTED_MODULE'
      })
    )
  })

  it('imports a packaged module', async () => {
    withConfig({})

    const ProtocolClass = await loadProtocolClass(VELORA_MODULE)

    expect(typeof ProtocolClass.prototype.quoteSwap).toBe('function')
  })

  it('reports a registered module whose files are missing as not installed', async () => {
    withConfig({ customModules: { '@dummy/pruned': { version: '1.0.0' } } })

    await expect(loadProtocolClass('@dummy/pruned')).rejects.toThrow(
      "Module '@dummy/pruned' is not installed."
    )
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

describe('protocol overrides', () => {
  it('drops protocols whose module is disabled', () => {
    withConfig({ overrides: { modules: { [VELORA_MODULE]: { enabled: false } } } })

    expect(getProtocols().velora).toBeUndefined()
    expect(getProtocols().usdt0).toEqual(catalog.providers.usdt0)
    expect(Object.keys(getProtocolsByKind('swap'))).toEqual(['rhinofi', 'symbiosis'])
    expect(() => getProtocol('velora')).toThrow("Protocol 'velora' is disabled.")
  })
})

describe('provider enable and disable', () => {
  const LIFI = { kind: 'swidge', module: CUSTOM_MODULE }

  let store

  beforeEach(() => {
    store = {}
    getConfig.mockImplementation((key) => (Object.hasOwn(store, key) ? store[key] : undefined))
    setConfig.mockImplementation((key, value) => { store[key] = value })
    deleteConfig.mockImplementation((key) => { delete store[key] })
  })

  it('writes a disabled delta and drops the provider from routing', () => {
    expect(setProviderEnabled('velora', false)).toBe(false)

    expect(store.overrides).toEqual({ providers: { velora: { enabled: false } } })
    expect(getProtocols().velora).toBeUndefined()
    expect(Object.keys(getProtocolsByKind('swap'))).toEqual(['rhinofi', 'symbiosis'])
  })

  it('removes the delta on enable, leaving no leftover key', () => {
    store.overrides = { providers: { velora: { enabled: false } } }

    expect(setProviderEnabled('velora', true)).toBe(false)

    expect(store.overrides).toBeUndefined()
    expect(getProtocols().velora).toEqual(catalog.providers.velora)
  })

  it('refuses to enable a second price feed', () => {
    store.customProviders = { coingecko: { kind: 'pricing', module: '@tetherto/wdk-pricing-coingecko-http' } }
    store.overrides = { providers: { bitfinex: { enabled: false } } }

    expect(() => setProviderEnabled('bitfinex', true)).toThrow(
      expect.objectContaining({
        message: 'A price feed is already enabled: coingecko.',
        code: 'INVALID_ARGUMENT',
        suggestion: 'Only one runs at a time. Disable it first with: wdk provider disable --name coingecko'
      })
    )
  })

  it('refuses to enable a second indexer', () => {
    store.customProviders = { myidx: { kind: 'indexer', config: {} } }
    store.overrides = { providers: { myidx: { enabled: false } } }

    expect(() => setProviderEnabled('myidx', true)).toThrow(
      expect.objectContaining({
        message: 'An indexer is already enabled: wdk-indexer.',
        code: 'INVALID_ARGUMENT',
        suggestion: 'Only one runs at a time. Disable it first with: wdk provider disable --name wdk-indexer'
      })
    )
  })

  it('enables a price feed when it is the only one', () => {
    store.overrides = { providers: { bitfinex: { enabled: false } } }

    expect(setProviderEnabled('bitfinex', true)).toBe(false)

    expect(getProtocols().bitfinex).toEqual(catalog.providers.bitfinex)
  })

  it('never blocks disabling a price feed', () => {
    store.customProviders = { coingecko: { kind: 'pricing', module: '@tetherto/wdk-pricing-coingecko-http' } }

    expect(setProviderEnabled('bitfinex', false)).toBe(false)

    expect(getProtocols().bitfinex).toBeUndefined()
  })

  it('points a disabled provider at its own enable command', () => {
    store.overrides = { providers: { velora: { enabled: false } } }

    expect(() => getProtocol('velora')).toThrow(
      expect.objectContaining({
        message: "Protocol 'velora' is disabled.",
        suggestion: 'Enable it with: wdk provider enable --name velora'
      })
    )
  })

  it('points a provider hidden by its module at the module instead', () => {
    store.overrides = { modules: { [VELORA_MODULE]: { enabled: false } } }

    expect(() => getProtocol('velora')).toThrow(
      expect.objectContaining({
        suggestion: `Enable its module with: wdk module enable --name ${VELORA_MODULE}`
      })
    )
  })

  it('refuses to toggle a provider hidden by its disabled module', () => {
    store.overrides = { modules: { [VELORA_MODULE]: { enabled: false } } }

    for (const enabled of [true, false]) {
      expect(() => setProviderEnabled('velora', enabled)).toThrow(
        expect.objectContaining({
          message: "Provider 'velora' is disabled by its module.",
          suggestion: `Enable its module with: wdk module enable --name ${VELORA_MODULE}`
        })
      )
    }
  })

  it('rejects a no-op toggle', () => {
    expect(() => setProviderEnabled('velora', true)).toThrow("'velora' is already enabled.")

    store.overrides = { providers: { velora: { enabled: false } } }
    expect(() => setProviderEnabled('velora', false)).toThrow("'velora' is already disabled.")
  })

  it('clears a stale override when enabling a name that no longer exists', () => {
    store.overrides = { providers: { gone: { enabled: false } } }

    expect(setProviderEnabled('gone', true)).toBe(true)
    expect(store.overrides).toBeUndefined()
  })

  it('rejects a module package name and points at wdk module', () => {
    expect(() => setProviderEnabled(VELORA_MODULE, false)).toThrow(
      expect.objectContaining({
        message: `'${VELORA_MODULE}' is not a provider.`,
        suggestion: `'${VELORA_MODULE}' is a module. Use: wdk module disable --name ${VELORA_MODULE}`
      })
    )
  })

  it('rejects an unknown name', () => {
    expect(() => setProviderEnabled('nope', false)).toThrow(
      expect.objectContaining({
        message: "'nope' is not a provider.",
        suggestion: 'See provider names with: wdk provider list'
      })
    )
  })

  it('toggles a custom provider too', () => {
    store.customProviders = { lifi: LIFI }

    expect(setProviderEnabled('lifi', false)).toBe(false)
    expect(getProtocols().lifi).toBeUndefined()
  })

  it('reports which providers the user disabled directly', () => {
    store.overrides = { providers: { velora: { enabled: false } } }

    expect(isProviderDisabled('velora')).toBe(true)
    expect(isProviderDisabled('usdt0')).toBe(false)
    expect(isProviderDisabled('nope')).toBe(false)
  })
})

describe('getProtocolsIncludingDisabled', () => {
  const WITHOUT_VELORA = PACKAGED_NAMES.filter((name) => name !== 'velora')

  it('keeps a provider the user disabled directly', () => {
    withConfig({ overrides: { providers: { velora: { enabled: false } } } })

    expect(Object.keys(getProtocolsIncludingDisabled())).toEqual(PACKAGED_NAMES)
  })

  it('leaves out a provider hidden by its disabled module', () => {
    withConfig({ overrides: { modules: { [VELORA_MODULE]: { enabled: false } } } })

    expect(Object.keys(getProtocolsIncludingDisabled())).toEqual(WITHOUT_VELORA)
  })

  it('leaves out a provider hidden by its module even when it has its own override', () => {
    withConfig({
      overrides: {
        providers: { velora: { enabled: false } },
        modules: { [VELORA_MODULE]: { enabled: false } }
      }
    })

    expect(Object.keys(getProtocolsIncludingDisabled())).toEqual(WITHOUT_VELORA)
  })
})

describe('custom providers', () => {
  const LIFI = {
    kind: 'swidge',
    module: CUSTOM_MODULE,
    config: { integrator: 'wdk' },
    networks: { ethereum: { chain: 1 }, optimism: { chain: 10 } }
  }

  it('merges custom providers after the packaged ones', () => {
    withConfig({ customProviders: { lifi: LIFI } })

    const protocols = getProtocols()

    expect(protocols.lifi).toEqual(LIFI)
    expect(Object.keys(protocols)).toEqual([...PACKAGED_NAMES, 'lifi'])
  })

  it('quotes a custom provider for the requests its declared kind serves', () => {
    withConfig({ customProviders: { lifi: LIFI } })

    expect(Object.keys(getProtocolsByKind('swap'))).toEqual(['velora', 'rhinofi', 'symbiosis', 'lifi'])
    expect(Object.keys(getProtocolsByKind('bridge'))).toEqual(['usdt0', 'rhinofi', 'symbiosis', 'lifi'])
  })

  it('lets a packaged entry win over a custom one of the same name', () => {
    withConfig({ customProviders: { velora: LIFI } })

    expect(getProtocol('velora')).toEqual(catalog.providers.velora)
  })

  it('drops a custom provider whose module is disabled', () => {
    withConfig({
      customProviders: { lifi: LIFI },
      overrides: { modules: { [CUSTOM_MODULE]: { enabled: false } } }
    })

    expect(getProtocols().lifi).toBeUndefined()
    expect(() => getProtocol('lifi')).toThrow(
      expect.objectContaining({
        message: "Protocol 'lifi' is disabled.",
        suggestion: `Enable its module with: wdk module enable --name ${CUSTOM_MODULE}`
      })
    )
  })

  it('takes a custom provider per-network config from its own entry', () => {
    withConfig({ customProviders: { lifi: LIFI } })

    expect(resolveProtocolConfig('lifi', 'ethereum')).toEqual({ integrator: 'wdk', chain: 1 })
    expect(resolveProtocolConfig('lifi', 'optimism')).toEqual({ integrator: 'wdk', chain: 10 })
    expect(resolveProtocolConfig('lifi', 'polygon')).toEqual({ integrator: 'wdk' })
  })

  it.each(['constructor', '__proto__'])(
    'does not resolve the inherited object property %s as a provider', (name) => {
      withConfig({ customProviders: {} })

      expect(() => getProtocol(name)).toThrow(`Unknown protocol '${name}'.`)
    }
  )
})
