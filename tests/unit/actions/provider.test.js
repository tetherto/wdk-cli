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

jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: { get: getConfig, set: setConfig, delete: deleteConfig }
}))

const {
  validateProviderSpec,
  verifyProviderKind,
  listProviders,
  getProviderInfo,
  addProvider,
  deleteProvider
} = await import('../../../src/actions/provider.js')

const require = createRequire(import.meta.url)
const catalog = require('../../../wdk.config.json')

const CUSTOM_MODULE = '@tetherto/wdk-wallet-ton'
const PACKAGED_NAMES = Object.keys(catalog.providers)

const LIFI_SPEC = {
  name: 'lifi',
  kind: 'swidge',
  module: CUSTOM_MODULE,
  config: { integrator: 'wdk' },
  networks: { ethereum: { chain: 1 } }
}
const LIFI_ENTRY = {
  kind: 'swidge',
  module: CUSTOM_MODULE,
  config: { integrator: 'wdk' },
  networks: { ethereum: { chain: 1 } }
}

beforeEach(() => {
  getConfig.mockReset()
  setConfig.mockReset()
  deleteConfig.mockReset()
  getConfig.mockReturnValue(undefined)
})

/**
 * Mocks config reads from a nested store, resolving dot-path keys the way Conf
 * does, so a test can set `providers.x.networks` and the code can still read
 * `providers.x.networks.ethereum`. The custom module is always registered, so
 * specs naming it pass module validation.
 *
 * @param {Record<string, unknown>} values
 */
function withConfig (values) {
  const all = { customModules: { [CUSTOM_MODULE]: { version: '1.0.0' } }, ...values }
  getConfig.mockImplementation((key) => {
    let current = /** @type {unknown} */ (all)
    for (const part of key.split('.')) {
      if (current === null || typeof current !== 'object' || !Object.hasOwn(current, part)) return undefined
      current = current[part]
    }
    return current
  })
}

describe('validateProviderSpec', () => {
  beforeEach(() => withConfig({}))

  it('returns the spec normalized, ignoring unknown fields', () => {
    expect(validateProviderSpec({ ...LIFI_SPEC, note: 'ignored' })).toEqual(LIFI_SPEC)
  })

  it('accepts a pricing provider when no other price feed is enabled', () => {
    withConfig({ overrides: { providers: { bitfinex: { enabled: false } } } })

    expect(validateProviderSpec({ name: 'coingecko', kind: 'pricing', module: CUSTOM_MODULE }))
      .toEqual({ name: 'coingecko', kind: 'pricing', module: CUSTOM_MODULE })
  })

  it('refuses a second price feed while the packaged one is enabled', () => {
    expect(() => validateProviderSpec({ name: 'coingecko', kind: 'pricing', module: CUSTOM_MODULE })).toThrow(
      expect.objectContaining({
        message: 'A price feed is already enabled: bitfinex.',
        code: 'INVALID_ARGUMENT',
        suggestion: 'Only one runs at a time. Disable it first with: wdk provider disable --name bitfinex'
      })
    )
  })

  it('lets a fiat provider in even though two fiat providers are enabled', () => {
    expect(validateProviderSpec({ name: 'banxa2', kind: 'fiat', module: CUSTOM_MODULE }))
      .toEqual({ name: 'banxa2', kind: 'fiat', module: CUSTOM_MODULE })
  })

  it('accepts a fiat provider, which needs no CLI-side adapter', () => {
    const spec = validateProviderSpec({
      name: 'banxa',
      kind: 'fiat',
      module: CUSTOM_MODULE,
      config: { apiKey: '', widgetUrl: '' },
      endpointKeys: ['widgetUrl']
    })

    expect(spec).toEqual({
      name: 'banxa',
      kind: 'fiat',
      module: CUSTOM_MODULE,
      endpointKeys: ['widgetUrl'],
      config: { apiKey: '', widgetUrl: '' }
    })
  })

  it.each([
    ['a bare string', 'widgetUrl'],
    ['an empty entry', ['']],
    ['a non-string entry', [1]]
  ])('rejects endpointKeys given as %s', (_label, endpointKeys) => {
    expect(() => validateProviderSpec({ name: 'banxa', kind: 'fiat', module: CUSTOM_MODULE, endpointKeys })).toThrow(
      expect.objectContaining({
        message: 'Provider spec "endpointKeys" must be an array of non-empty strings.',
        code: 'INVALID_ARGUMENT'
      })
    )
  })

  it('accepts a spec without config or networks', () => {
    expect(validateProviderSpec({ name: 'lifi', kind: 'swap', module: CUSTOM_MODULE })).toEqual({
      name: 'lifi',
      kind: 'swap',
      module: CUSTOM_MODULE
    })
  })

  it('accepts a packaged module as the backing package', () => {
    const spec = validateProviderSpec({
      name: 'velora-2',
      kind: 'swap',
      module: catalog.providers.velora.module
    })

    expect(spec.module).toBe(catalog.providers.velora.module)
  })

  it('rejects a non-object spec', () => {
    expect(() => validateProviderSpec('x')).toThrow('Provider spec must be a JSON object.')
    expect(() => validateProviderSpec([])).toThrow('Provider spec must be a JSON object.')
  })

  it.each(['Lifi', 'li fi', '-lifi', 'li_fi', '', 42])('rejects the name %p', (name) => {
    expect(() => validateProviderSpec({ name, kind: 'swap', module: CUSTOM_MODULE })).toThrow(
      'Provider spec "name" must be lowercase alphanumeric with hyphens.'
    )
  })

  it('rejects a packaged provider name and suggests another', () => {
    expect(() => validateProviderSpec({ name: 'velora', kind: 'swap', module: CUSTOM_MODULE })).toThrow(
      expect.objectContaining({
        message: "'velora' is a built-in provider.",
        suggestion: 'Register your module under a different name.'
      })
    )
  })

  it('rejects a name that is already added', () => {
    withConfig({ customProviders: { lifi: LIFI_ENTRY } })

    expect(() => validateProviderSpec(LIFI_SPEC)).toThrow(
      expect.objectContaining({
        message: "Provider 'lifi' is already added.",
        suggestion: 'Remove it first with: wdk provider delete --name lifi'
      })
    )
  })

  it.each([undefined, 'dex', 'price', 7])('rejects the kind %p with the accepted list', (kind) => {
    expect(() => validateProviderSpec({ name: 'lifi', kind, module: CUSTOM_MODULE })).toThrow(
      'Provider spec "kind" must be one of: swap, bridge, swidge, fiat'
    )
  })

  it('names the unregistered module and the command that adds it', () => {
    expect(() => validateProviderSpec({ name: 'lifi', kind: 'swap', module: '@nope/pkg' })).toThrow(
      expect.objectContaining({
        message: "Module '@nope/pkg' is not registered.",
        code: 'UNSUPPORTED_MODULE',
        suggestion: 'Add it first with: wdk module add --name @nope/pkg'
      })
    )
  })

  it.each([undefined, '', 42])('rejects the module %p as not a package name', (module) => {
    expect(() => validateProviderSpec({ name: 'lifi', kind: 'swap', module })).toThrow(
      'Provider spec "module" must be a package name.'
    )
  })

  it('rejects a malformed config or networks block', () => {
    const base = { name: 'lifi', kind: 'swap', module: CUSTOM_MODULE }

    expect(() => validateProviderSpec({ ...base, config: 'x' })).toThrow(
      'Provider spec "config" must be an object when provided.'
    )
    expect(() => validateProviderSpec({ ...base, networks: [] })).toThrow(
      'Provider spec "networks" must be an object when provided.'
    )
    expect(() => validateProviderSpec({ ...base, networks: { ethereum: 1 } })).toThrow(
      'Provider spec "networks.ethereum" must be an object.'
    )
  })

  it('rejects __proto__ as a name, which the format rule already excludes', () => {
    expect(() => validateProviderSpec({ name: '__proto__', kind: 'swap', module: CUSTOM_MODULE })).toThrow(
      'Provider spec "name" must be lowercase alphanumeric with hyphens.'
    )
  })

  it('treats a name matching an inherited object property as an ordinary name', () => {
    expect(validateProviderSpec({ name: 'constructor', kind: 'swap', module: CUSTOM_MODULE })).toEqual({
      name: 'constructor',
      kind: 'swap',
      module: CUSTOM_MODULE
    })
  })
})

describe('verifyProviderKind', () => {
  it('rejects a spec whose module is not a registered package', async () => {
    withConfig({})

    await expect(
      verifyProviderKind({ name: 'lifi', kind: 'swap', module: '@nope/unregistered' })
    ).rejects.toThrow("Module '@nope/unregistered' is not registered.")
  })

  it('rejects a registered module whose files are missing', async () => {
    withConfig({ customModules: { '@dummy/pruned': { version: '1.0.0' } } })

    await expect(
      verifyProviderKind({ name: 'lifi', kind: 'swap', module: '@dummy/pruned' })
    ).rejects.toThrow("Module '@dummy/pruned' is not installed.")
  })

  it('accepts a spec whose installed module implements the declared kind', async () => {
    withConfig({})

    await expect(
      verifyProviderKind({
        name: 'velora-2',
        kind: 'swap',
        module: catalog.providers.velora.module
      })
    ).resolves.toBeUndefined()
  })

  it('rejects a spec whose installed module implements another kind', async () => {
    withConfig({})

    await expect(
      verifyProviderKind({ name: 'velora-2', kind: 'bridge', module: catalog.providers.velora.module })
    ).rejects.toThrow(
      "Provider 'velora-2' is declared bridge, but its module does not implement quoteBridge and bridge."
    )
  })
})

describe('listProviders', () => {
  it('lists the packaged providers with their kind and source', () => {
    withConfig({})

    const result = listProviders()

    expect(result.count).toBe(PACKAGED_NAMES.length)
    expect(result.providers.map((p) => p.name)).toEqual(PACKAGED_NAMES)
    expect(result.providers.find((p) => p.name === 'velora')).toEqual({
      name: 'velora',
      kind: 'swap',
      module: catalog.providers.velora.module,
      source: 'built-in',
      enabled: true
    })
    expect(result.providers.find((p) => p.name === 'moonpay')).toEqual({
      name: 'moonpay',
      kind: 'fiat',
      module: catalog.providers.moonpay.module,
      source: 'built-in',
      enabled: true
    })
  })

  it('appends custom providers after the packaged ones', () => {
    withConfig({ customProviders: { lifi: LIFI_ENTRY } })

    const result = listProviders()

    expect(result.providers.map((p) => p.name)).toEqual([...PACKAGED_NAMES, 'lifi'])
    expect(result.providers[result.providers.length - 1]).toEqual({
      name: 'lifi',
      kind: 'swidge',
      module: CUSTOM_MODULE,
      source: 'custom',
      enabled: true
    })
  })

  it('keeps a provider the user disabled directly, marked not enabled', () => {
    withConfig({ overrides: { providers: { velora: { enabled: false } } } })

    const velora = listProviders().providers.find((p) => p.name === 'velora')

    expect(velora.enabled).toBe(false)
  })

  it('leaves out a provider hidden by its disabled module', () => {
    withConfig({ overrides: { modules: { [catalog.providers.velora.module]: { enabled: false } } } })

    expect(listProviders().providers.map((p) => p.name)).toEqual(
      PACKAGED_NAMES.filter((name) => name !== 'velora')
    )
  })
})

describe('getProviderInfo', () => {
  it('returns a packaged provider with its per-network config', () => {
    withConfig({})

    const info = getProviderInfo('symbiosis')

    expect(info).toMatchObject({ name: 'symbiosis', kind: 'swidge', source: 'built-in', enabled: true })
    expect(info.config).toEqual({ partnerId: 'wdk' })
    expect(info.networks.ethereum).toEqual({ partnerId: 'wdk', chain: 1 })
    expect(info.networks.polygon).toEqual({ partnerId: 'wdk', chain: 137 })
  })

  it('returns a custom provider with the per-network config from its own entry', () => {
    withConfig({ customProviders: { lifi: LIFI_ENTRY } })

    const info = getProviderInfo('lifi')

    expect(info).toMatchObject({ name: 'lifi', kind: 'swidge', source: 'custom', enabled: true })
    expect(info.config).toEqual({ integrator: 'wdk' })
    expect(info.networks).toEqual({ ethereum: { integrator: 'wdk', chain: 1 } })
  })

  it('shows the config the user set, general and per network', () => {
    withConfig({
      providers: {
        symbiosis: {
          config: { apiKey: 'user-key' },
          networks: { ethereum: { chain: 99 }, optimism: { chain: 10 } }
        }
      }
    })

    const info = getProviderInfo('symbiosis')

    expect(info.config).toEqual({ partnerId: 'wdk', apiKey: 'user-key' })
    expect(info.networks.ethereum).toEqual({ partnerId: 'wdk', apiKey: 'user-key', chain: 99 })
    expect(info.networks.optimism).toEqual({ partnerId: 'wdk', apiKey: 'user-key', chain: 10 })
  })

  it('describes a provider whose module is disabled', () => {
    withConfig({ overrides: { modules: { [catalog.providers.velora.module]: { enabled: false } } } })

    expect(getProviderInfo('velora').enabled).toBe(false)
  })

  it('describes a provider the user disabled directly', () => {
    withConfig({ overrides: { providers: { velora: { enabled: false } } } })

    expect(getProviderInfo('velora').enabled).toBe(false)
  })

  it('rejects an unknown provider and lists the registered ones', () => {
    withConfig({})

    expect(() => getProviderInfo('nope')).toThrow(
      expect.objectContaining({
        message: "Unknown provider 'nope'.",
        suggestion: `Registered providers: ${PACKAGED_NAMES.join(', ')}`
      })
    )
  })
})

describe('addProvider', () => {
  it('persists the entry and reports it', () => {
    withConfig({})

    const result = addProvider(LIFI_SPEC)

    expect(setConfig).toHaveBeenCalledWith('customProviders', { lifi: LIFI_ENTRY })
    expect(result).toEqual({ name: 'lifi', kind: 'swidge', module: CUSTOM_MODULE, added: true })
  })

  it('persists endpointKeys, so the module receives a callback and not a string', () => {
    withConfig({})

    addProvider({
      name: 'banxa',
      kind: 'fiat',
      module: CUSTOM_MODULE,
      endpointKeys: ['widgetUrl'],
      config: { apiKey: '', widgetUrl: '' }
    })

    expect(setConfig).toHaveBeenCalledWith('customProviders', {
      banxa: {
        kind: 'fiat',
        module: CUSTOM_MODULE,
        endpointKeys: ['widgetUrl'],
        config: { apiKey: '', widgetUrl: '' }
      }
    })
  })

  it('keeps existing custom providers', () => {
    withConfig({ customProviders: { other: { kind: 'swap', module: CUSTOM_MODULE } } })

    addProvider({ name: 'lifi', kind: 'swap', module: CUSTOM_MODULE })

    expect(setConfig).toHaveBeenCalledWith('customProviders', {
      other: { kind: 'swap', module: CUSTOM_MODULE },
      lifi: { kind: 'swap', module: CUSTOM_MODULE }
    })
  })
})

describe('deleteProvider', () => {
  it('removes the only custom provider by dropping the key', () => {
    withConfig({ customProviders: { lifi: LIFI_ENTRY } })

    expect(deleteProvider('lifi')).toEqual({ name: 'lifi', deleted: true })
    expect(deleteConfig).toHaveBeenCalledWith('customProviders')
  })

  it('keeps the other custom providers', () => {
    const other = { kind: 'swap', module: CUSTOM_MODULE }
    withConfig({ customProviders: { lifi: LIFI_ENTRY, other } })

    deleteProvider('lifi')

    expect(setConfig).toHaveBeenCalledWith('customProviders', { other })
  })

  it('refuses to delete a packaged provider', () => {
    withConfig({})

    expect(() => deleteProvider('velora')).toThrow(
      "'velora' is a built-in provider and cannot be deleted."
    )
    expect(setConfig).not.toHaveBeenCalled()
  })

  it('reports a name that was never added', () => {
    withConfig({ customProviders: { lifi: LIFI_ENTRY } })

    expect(() => deleteProvider('nope')).toThrow(
      expect.objectContaining({
        message: "Provider 'nope' is not a custom provider.",
        suggestion: 'Custom providers: lifi'
      })
    )
  })
})
