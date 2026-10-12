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

import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Cli } from './helpers.js'

const catalog = createRequire(import.meta.url)('../../wdk.config.json')
const MOONPAY_MODULE = catalog.providers.moonpay.module
const BITFINEX_MODULE = catalog.providers.bitfinex.module
const VELORA_MODULE = catalog.providers.velora.module

/** @type {Cli} */
let cli

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const INDEXER_MODULE = catalog.providers['wdk-indexer'].module
const PROVIDER_COUNT = Object.keys(catalog.providers).length

/** A provider the user adds, for the add/delete paths. */
const CUSTOM = JSON.stringify({
  name: 'myramp', kind: 'fiat', module: MOONPAY_MODULE, config: {}
})

/** A second price feed, for the single-instance rule. */
const SECOND_FEED = JSON.stringify({
  name: 'second-feed', kind: 'pricing', module: BITFINEX_MODULE, config: {}
})

/** Every provider the catalog ships, with the module behind it. */
const PROVIDERS = Object.entries(catalog.providers).map(([name, entry]) => ({
  name,
  kind: entry.kind,
  module: entry.module
}))

beforeEach(() => { cli = new Cli() })
afterEach(async () => {
  await cli.run(['wallet', 'lock', '--all'], { unlocked: true })
  cli.cleanup()
})

/**
 * Imports the fixed test seed and unlocks it.
 *
 * @returns {Promise<void>}
 */
async function importAndUnlock () {
  await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
    unlocked: true,
    stdin: SEED + '\n'
  })
  await cli.run(['wallet', 'unlock', '--name', 'main'], { unlocked: true })
}

/**
 * Disables a module and returns what the command reported.
 *
 * @param {string} name - The module package name.
 * @returns {Promise<Record<string, unknown>>} The command's JSON payload.
 */
function disableModule (name) {
  return cli.json(['module', 'disable', '--name', name], { unlocked: true })
}

describe('provider list', () => {
  it('lists every packaged provider, pricing first', async () => {
    const { providers, count } = await cli.json(['provider', 'list'])

    expect(count).toBe(8)
    expect(providers.map((p) => p.name)).toEqual([
      'wdk-indexer', 'bitfinex', 'moonpay', 'transak', 'velora', 'usdt0', 'rhinofi', 'symbiosis'
    ])
  })
})

describe('provider info', () => {
  it('reports the indexer with the client package backing it', async () => {
    const info = await cli.json(['provider', 'info', '--name', 'wdk-indexer'])

    expect(info).toMatchObject({
      name: 'wdk-indexer',
      kind: 'indexer',
      module: '@tetherto/wdk-indexer-http',
      source: 'built-in'
    })
  })

  it('reports an unknown provider by name', async () => {
    const result = await cli.run(['provider', 'info', '--name', 'nope'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Unknown provider 'nope'.")
  })
})

describe('provider add', () => {
  it.each([
    ['swap', 'velora'],
    ['bridge', 'usdt0'],
    ['swidge', 'rhinofi'],
    ['fiat', 'moonpay']
  ])('accepts a %s provider', async (kind, packaged) => {
    const added = await cli.json(['provider', 'add', JSON.stringify({
      name: `my-${kind}`, kind, module: catalog.providers[packaged].module, config: {}
    })], { unlocked: true })

    expect(added).toMatchObject({ name: `my-${kind}`, kind, added: true })
    const { providers } = await cli.json(['provider', 'list'])
    expect(providers.find((p) => p.name === `my-${kind}`).enabled).toBe(true)
  })

  it('reads the spec from a file', async () => {
    const spec = join(cli.configHome, 'spec.json')
    writeFileSync(spec, JSON.stringify({
      name: 'fromfile', kind: 'swap', module: VELORA_MODULE, config: {}
    }))

    const added = await cli.json(['provider', 'add', spec], { unlocked: true })

    expect(added).toMatchObject({ name: 'fromfile', kind: 'swap', added: true })
  })

  it('stores per-network config given in the spec', async () => {
    await cli.json(['provider', 'add', JSON.stringify({
      name: 'withnets', kind: 'swap', module: VELORA_MODULE, config: {},
      networks: { ethereum: { slippage: 25 } }
    })], { unlocked: true })

    const info = await cli.json(['provider', 'info', '--name', 'withnets'])

    expect(info.networks.ethereum).toMatchObject({ slippage: 25 })
  })

  it('persists endpointKeys so the module is handed a callback', async () => {
    await cli.json(['provider', 'add', JSON.stringify({
      name: 'banxa',
      kind: 'fiat',
      module: MOONPAY_MODULE,
      endpointKeys: ['widgetUrl'],
      config: { apiKey: 'dummy-key', widgetUrl: 'https://dummy-signer.test/sign' }
    })])

    expect(cli.readConfig().customProviders.banxa.endpointKeys).toEqual(['widgetUrl'])
  })

  it('refuses a kind the registry does not define', async () => {
    const result = await cli.run(['provider', 'add', JSON.stringify({
      name: 'x', kind: 'lending', module: MOONPAY_MODULE
    })])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Provider spec "kind" must be one of')
  })

  it('refuses an indexer, which ships with the CLI', async () => {
    const result = await cli.run(['provider', 'add', JSON.stringify({
      name: 'myidx', kind: 'indexer', module: MOONPAY_MODULE
    })])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Indexer providers cannot be added.')
  })

  it('refuses a module that is not registered', async () => {
    const result = await cli.run(['provider', 'add', JSON.stringify({
      name: 'x', kind: 'swap', module: '@nobody/not-installed'
    })])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Module '@nobody/not-installed' is not registered.")
  })

  it('refuses a name that is already taken', async () => {
    const result = await cli.run(['provider', 'add', JSON.stringify({
      name: 'moonpay', kind: 'fiat', module: MOONPAY_MODULE
    })])

    expect(result.code).toBe(1)
    expect(result.output).toContain("'moonpay' is a built-in provider.")
  })

  it('refuses a spec that is not an object', async () => {
    const result = await cli.run(['provider', 'add', '"just a string"'])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Cannot read <data>')
  })

  it('refuses malformed JSON', async () => {
    const result = await cli.run(['provider', 'add', '{not json'])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Invalid JSON in <data>')
  })

  it('refuses endpointKeys that are not strings', async () => {
    const result = await cli.run(['provider', 'add', JSON.stringify({
      name: 'banxa', kind: 'fiat', module: MOONPAY_MODULE, endpointKeys: [1]
    })])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Provider spec "endpointKeys" must be an array of non-empty strings.')
  })
})

describe('provider enable', () => {
  it('refuses to enable a second indexer', async () => {
    const config = cli.readConfig()
    config.customProviders = { myidx: { kind: 'indexer', config: {} } }
    config.overrides = { providers: { myidx: { enabled: false } } }
    cli.writeConfig(config)

    const result = await cli.run(['provider', 'enable', '--name', 'myidx'])

    expect(result.code).toBe(1)
    expect(result.output).toContain('An indexer is already enabled: wdk-indexer.')
  })

  it('is cleared on the next enable, once', async () => {
    cli.writeConfig({ overrides: { providers: { ghost: { enabled: false } } } })

    const cleared = await cli.json(['provider', 'enable', '--name', 'ghost'], { unlocked: true })
    expect(cleared.stale).toBe(true)

    const again = await cli.run(['provider', 'enable', '--name', 'ghost'], { unlocked: true })
    expect(again.code).toBe(1)
    expect(again.output).toContain("'ghost' is not a provider.")
  })
})

describe('provider disable', () => {
  // The contrast with a module disable: this one stays visible and flagged,
  // because the user can undo it directly.
  it.each(PROVIDERS)('keeps the $kind provider $name listed but off', async (provider) => {
    const off = await cli.json(['provider', 'disable', '--name', provider.name], { unlocked: true })
    expect(off.enabled).toBe(false)

    const { providers } = await cli.json(['provider', 'list'])
    expect(providers).toHaveLength(PROVIDER_COUNT)
    expect(providers.find((p) => p.name === provider.name).enabled).toBe(false)

    const on = await cli.json(['provider', 'enable', '--name', provider.name], { unlocked: true })
    expect(on.enabled).toBe(true)
  })

  it('always allows disabling, so a feed can be swapped', async () => {
    const result = await cli.run(['provider', 'disable', '--name', 'wdk-indexer'])

    expect(result.code).toBe(0)
  })

  it('refuses to disable one that is already off', async () => {
    await cli.json(['provider', 'disable', '--name', 'velora'], { unlocked: true })

    const result = await cli.run(['provider', 'disable', '--name', 'velora'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain("'velora' is already disabled.")
  })

  it('keeps its own disable through a module cycle', async () => {
    const { module: moduleName } = catalog.providers.velora
    await cli.json(['provider', 'disable', '--name', 'velora'], { unlocked: true })

    await disableModule(moduleName)
    await cli.json(['module', 'enable', '--name', moduleName], { unlocked: true })

    const { providers } = await cli.json(['provider', 'list'])
    expect(providers.find((p) => p.name === 'velora').enabled).toBe(false)
  })
})

describe('provider delete', () => {
  it('deletes one that is still enabled, without disabling it first', async () => {
    await cli.json(['provider', 'add', CUSTOM], { unlocked: true })

    const deleted = await cli.json(['provider', 'delete', '--name', 'myramp'], { unlocked: true })

    expect(deleted).toMatchObject({ name: 'myramp', deleted: true })
    const { providers } = await cli.json(['provider', 'list'])
    expect(providers.find((p) => p.name === 'myramp')).toBeUndefined()
  })

  it('releases the name for a later add', async () => {
    await cli.json(['provider', 'add', CUSTOM], { unlocked: true })
    await cli.json(['provider', 'delete', '--name', 'myramp'], { unlocked: true })

    const readded = await cli.json(['provider', 'add', CUSTOM], { unlocked: true })

    expect(readded.name).toBe('myramp')
    const { providers } = await cli.json(['provider', 'list'])
    expect(providers.filter((p) => p.name === 'myramp')).toHaveLength(1)
  })

  it('leaves the packaged providers of the same kind alone', async () => {
    await cli.json(['provider', 'add', CUSTOM], { unlocked: true })

    await cli.json(['provider', 'delete', '--name', 'myramp'], { unlocked: true })

    const { providers } = await cli.json(['provider', 'list'])
    expect(providers.find((p) => p.name === 'moonpay').enabled).toBe(true)
    expect(providers.find((p) => p.name === 'transak').enabled).toBe(true)
  })

  it('frees the slot on a kind that allows only one', async () => {
    await cli.json(['provider', 'disable', '--name', 'bitfinex'], { unlocked: true })
    await cli.json(['provider', 'add', JSON.stringify({
      name: 'feed2', kind: 'pricing', module: BITFINEX_MODULE, config: {}
    })], { unlocked: true })

    const blocked = await cli.run(['provider', 'enable', '--name', 'bitfinex'], { unlocked: true })
    expect(blocked.code).toBe(1)
    expect(blocked.output).toContain('A price feed is already enabled: feed2.')

    await cli.json(['provider', 'delete', '--name', 'feed2'], { unlocked: true })

    const freed = await cli.run(['provider', 'enable', '--name', 'bitfinex'], { unlocked: true })
    expect(freed.code).toBe(0)
    expect(freed.output).toContain("Provider 'bitfinex' enabled.")
  })

  it('takes its stored config with it, so a later provider starts clean', async () => {
    await cli.json(['provider', 'add', CUSTOM], { unlocked: true })
    await cli.json(
      ['config', 'set', '--key', 'providers.myramp.config.apiKey', '--value', 'SUPER-SECRET'],
      { unlocked: true }
    )

    await cli.json(['provider', 'delete', '--name', 'myramp'], { unlocked: true })

    const orphan = await cli.json(['config', 'get', '--key', 'providers.myramp.config.apiKey'])
    expect(orphan.value).toBeNull()

    // The name is reusable, so a leftover key would be merged into whatever is
    // registered next under it — a different service holding the old secret.
    await cli.json(['provider', 'add', CUSTOM], { unlocked: true })
    const info = await cli.json(['provider', 'info', '--name', 'myramp'])
    expect(info.config).toEqual({})
  })

  it('takes its disable override with it when deleted', async () => {
    await cli.json(['provider', 'add', CUSTOM], { unlocked: true })
    await cli.json(['provider', 'disable', '--name', 'myramp'], { unlocked: true })
    await cli.json(['provider', 'delete', '--name', 'myramp'], { unlocked: true })

    const result = await cli.run(['provider', 'enable', '--name', 'myramp'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain("'myramp' is not a provider.")
  })

  it('leaves the config of a packaged provider alone', async () => {
    await cli.json(
      ['config', 'set', '--key', 'providers.wdk-indexer.config.apiKey', '--value', 'keep-me'],
      { unlocked: true }
    )
    await cli.json(['provider', 'add', CUSTOM], { unlocked: true })

    await cli.json(['provider', 'delete', '--name', 'myramp'], { unlocked: true })

    const kept = await cli.json(['config', 'get', '--key', 'providers.wdk-indexer.config.apiKey'])
    expect(kept.value).toBe('keep-me')
  })

  it('refuses to delete a packaged provider', async () => {
    const result = await cli.run(['provider', 'delete', '--name', 'bitfinex'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("'bitfinex' is a built-in provider and cannot be deleted.")
  })

  it('reports a delete for a provider that was never added', async () => {
    const result = await cli.run(['provider', 'delete', '--name', 'ghost'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Provider 'ghost' is not a custom provider.")
  })
})

describe('kinds that allow only one provider', () => {
  it('refuses a second price feed while one is enabled', async () => {
    const result = await cli.run(['provider', 'add', SECOND_FEED], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain('A price feed is already enabled: bitfinex.')
  })

  it('accepts the second once the first is off, then guards the way back', async () => {
    await cli.json(['provider', 'disable', '--name', 'bitfinex'], { unlocked: true })

    const added = await cli.json(['provider', 'add', SECOND_FEED], { unlocked: true })
    expect(added.name).toBe('second-feed')

    const result = await cli.run(['provider', 'enable', '--name', 'bitfinex'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain('A price feed is already enabled: second-feed.')
  })

  it('lets a multi-instance kind run two providers at once', async () => {
    const { providers } = await cli.json(['provider', 'list'])

    const fiat = providers.filter((p) => p.kind === 'fiat')
    const swidge = providers.filter((p) => p.kind === 'swidge')
    expect(fiat.every((p) => p.enabled)).toBe(true)
    expect(swidge.every((p) => p.enabled)).toBe(true)
    expect(fiat).toHaveLength(2)
    expect(swidge).toHaveLength(2)
  })
})

describe('a provider hidden by a disabled module', () => {
  // Every kind is meant to behave the same here, so drive the same contract from
  // the catalog: a new provider kind is covered the day it is registered.
  it.each(PROVIDERS)('hides the $kind provider $name when its module goes', async (provider) => {
    const before = await cli.json(['provider', 'list'])
    expect(before.providers).toHaveLength(PROVIDER_COUNT)
    expect(before.providers.find((p) => p.name === provider.name).enabled).toBe(true)

    await disableModule(provider.module)

    const { providers } = await cli.json(['provider', 'list'])
    expect(providers).toHaveLength(PROVIDER_COUNT - 1)
    expect(providers.find((p) => p.name === provider.name)).toBeUndefined()

    const info = await cli.json(['provider', 'info', '--name', provider.name])
    expect(info.enabled).toBe(false)

    const result = await cli.run(['provider', 'enable', '--name', provider.name], { unlocked: true })
    expect(result.code).toBe(1)
    expect(result.output).toContain(`Provider '${provider.name}' is disabled by its module.`)
    expect(result.output).toContain(`wdk module enable --name ${provider.module}`)
  })

  it('leaves a provider of the same kind on a different module alone', async () => {
    await disableModule(catalog.providers.moonpay.module)

    const { providers } = await cli.json(['provider', 'list'])

    expect(providers.find((p) => p.name === 'moonpay')).toBeUndefined()
    expect(providers.find((p) => p.name === 'transak').enabled).toBe(true)
  })

  it('fails the command that consumes the provider', async () => {
    await disableModule(INDEXER_MODULE)

    const result = await cli.run(['get', 'history', '--network', 'ethereum'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain('No indexer is available.')
  })
})

describe('provider config through a module cycle', () => {
  it('keeps the general config and the per-network override', async () => {
    const indexerKey = 'providers.wdk-indexer.config.apiKey'
    const veloraKey = 'providers.velora.networks.ethereum.slippage'
    await cli.json(['config', 'set', '--key', indexerKey, '--value', 'secret-abc'], { unlocked: true })
    await cli.json(['config', 'set', '--key', veloraKey, '--value', '50'], { unlocked: true })

    await disableModule(INDEXER_MODULE)
    await cli.json(['module', 'enable', '--name', INDEXER_MODULE], { unlocked: true })

    expect((await cli.json(['config', 'get', '--key', indexerKey])).value).toBe('secret-abc')
    expect((await cli.json(['config', 'get', '--key', veloraKey])).value).toBe(50)
  })
})

describe('a provider the user added, in use', () => {
  // Registering a provider is only half of it: the resolver has to pick it.
  // Exercising one for real needs its API, so this goes as far as selection,
  // which is the part the CLI owns.
  it('is selected once the packaged providers of its kind are off', async () => {
    await cli.json(['provider', 'add', JSON.stringify({
      name: 'myramp', kind: 'fiat', module: MOONPAY_MODULE, config: {}
    })], { unlocked: true })
    await cli.json(['provider', 'disable', '--name', 'moonpay'], { unlocked: true })
    await cli.json(['provider', 'disable', '--name', 'transak'], { unlocked: true })

    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })
    await cli.run(['wallet', 'unlock', '--name', 'main'], { unlocked: true })

    const result = await cli.run(
      ['buy', '--network', 'ethereum', '--token', 'usdt', '--fiat-amount', '100'],
      { unlocked: true }
    )

    // Naming myramp's own missing mapping proves it was resolved and asked for
    // its slug — not that the kind had no provider at all.
    expect(result.code).toBe(1)
    expect(result.output).toContain("Token 'usdt' on 'ethereum' has no myramp mapping.")
  })
})

describe('the passphrase gate', () => {
  it('stops a provider change without the passphrase', async () => {
    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })

    const result = await cli.run(['provider', 'disable', '--name', 'velora'])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Cannot prompt for a passphrase when stdin is piped.')

    const { providers } = await cli.json(['provider', 'list'])
    expect(providers.find((p) => p.name === 'velora').enabled).toBe(true)
  })
})
