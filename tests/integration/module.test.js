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
import { statSync } from 'node:fs'
import { Cli } from './helpers.js'

const catalog = createRequire(import.meta.url)('../../wdk.config.json')
const MOONPAY_MODULE = catalog.providers.moonpay.module
const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const BITFINEX_MODULE = catalog.providers.bitfinex.module
const MODULE_COUNT = Object.keys(catalog.modules).length
const SPARK_METHOD_COUNT = Object.keys(catalog.modules[catalog.networks.spark.module].methods).length

/** A package that really is installed, for pinning against its own version. */
const INSTALLED_PACKAGE = '@tetherto/wdk-utils'
const INSTALLED_VERSION = createRequire(import.meta.url)(
  `../../node_modules/${INSTALLED_PACKAGE}/package.json`
).version

/** @type {Cli} */
let cli

beforeEach(() => { cli = new Cli() })
afterEach(() => cli.cleanup())

describe('module list', () => {
  it('reports every catalog module as installed and ok', async () => {
    const { modules } = await cli.json(['module', 'list'])

    expect(modules).toHaveLength(MODULE_COUNT)
    expect(modules.every((m) => m.status === 'ok')).toBe(true)
  })

  it('reports a custom module pinned to a version that is not installed', async () => {
    cli.writeConfig({ customModules: { [INSTALLED_PACKAGE]: { version: '9.9.9' } } })

    const { modules } = await cli.json(['module', 'list'])

    expect(modules.find((m) => m.module === INSTALLED_PACKAGE)).toMatchObject({
      pinned: '9.9.9',
      installed: INSTALLED_VERSION,
      status: 'version mismatch',
      source: 'custom'
    })
  })

  it('reports a custom module that was never installed', async () => {
    cli.writeConfig({ customModules: { '@ghost/never-installed': { version: '1.0.0' } } })

    const { modules } = await cli.json(['module', 'list'])

    expect(modules.find((m) => m.module === '@ghost/never-installed')).toMatchObject({
      pinned: '1.0.0',
      installed: null,
      status: 'not installed',
      source: 'custom'
    })
  })

  it('reports an override left behind by a module that is gone', async () => {
    cli.writeConfig({ overrides: { modules: { '@ghost/gone': { enabled: false } } } })

    const { modules } = await cli.json(['module', 'list'])

    expect(modules.find((m) => m.module === '@ghost/gone')).toMatchObject({
      pinned: '-',
      status: 'stale override',
      source: 'override'
    })
  })
})

describe('module add', () => {
  // Adding a new package installs it from the registry, so the successful path
  // belongs in a suite allowed to reach the network. This refusal is decided
  // before any install runs.
  it('refuses a package that already ships with the CLI', async () => {
    const result = await cli.run(['module', 'add', '--name', BITFINEX_MODULE], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain(`'${BITFINEX_MODULE}' is a built-in module.`)
    expect(result.output).toContain('pass one explicitly')
  })
})

describe('module remove', () => {
  it('refuses a packaged module, which can only be disabled', async () => {
    const result = await cli.run(['module', 'remove', '--name', MOONPAY_MODULE], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain(`'${MOONPAY_MODULE}' is a built-in module and cannot be removed.`)
  })

  it('reports a module that was never added', async () => {
    const result = await cli.run(
      ['module', 'remove', '--name', '@nobody/never-added'], { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain("Module '@nobody/never-added' is not a custom module.")
  })
})

describe('module disable', () => {
  it('marks the module disabled and hides the providers it serves', async () => {
    await cli.run(['module', 'disable', '--name', MOONPAY_MODULE])

    const { modules } = await cli.json(['module', 'list'])
    const { providers } = await cli.json(['provider', 'list'])

    expect(modules.find((m) => m.module === MOONPAY_MODULE).status).toBe('disabled')
    expect(providers.find((p) => p.name === 'moonpay')).toBeUndefined()
  })

  it('refuses one that is already disabled', async () => {
    await cli.run(['module', 'disable', '--name', MOONPAY_MODULE])

    const again = await cli.run(['module', 'disable', '--name', MOONPAY_MODULE])

    expect(again.code).toBe(1)
    expect(again.output).toContain(`'${MOONPAY_MODULE}' is already disabled.`)
  })

  it.each([
    ['ethereum', "'ethereum' is a network. Use: wdk network disable --name ethereum"],
    ['velora', "'velora' is a provider. Use: wdk provider disable --name velora"],
    ['@no/such', 'See package names with: wdk module list']
  ])('points at the right registry for %p', async (name, hint) => {
    const result = await cli.run(['module', 'disable', '--name', name], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain(`'${name}' is not a module.`)
    expect(result.output).toContain(hint)
  })
})

describe('module enable', () => {
  it('brings a disabled module back', async () => {
    await cli.run(['module', 'disable', '--name', MOONPAY_MODULE])

    await cli.run(['module', 'enable', '--name', MOONPAY_MODULE])
    const { modules } = await cli.json(['module', 'list'])

    expect(modules.find((m) => m.module === MOONPAY_MODULE).status).toBe('ok')
  })

  it('refuses one that is already enabled', async () => {
    const result = await cli.run(['module', 'enable', '--name', MOONPAY_MODULE], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain(`'${MOONPAY_MODULE}' is already enabled.`)
  })
})

describe('module methods', () => {
  it('lists the methods a wallet module declares', async () => {
    const { network, methods } = await cli.json(['method', 'list', '--network', 'spark'])

    expect(network).toBe('spark')
    expect(methods.map((m) => m.name)).toContain('getStaticDepositAddress')
  })

  it('marks each method read or write', async () => {
    const { methods } = await cli.json(['method', 'list', '--network', 'spark'])

    expect(methods).toHaveLength(SPARK_METHOD_COUNT)
    expect(methods.every((m) => m.kind === 'read' || m.kind === 'write')).toBe(true)
  })

  it('returns an empty list for a network that declares none', async () => {
    const result = await cli.json(['method', 'list', '--network', 'bitcoin'])

    expect(result).toEqual({ network: 'bitcoin', methods: [] })
  })

  it('reports a network that is not registered', async () => {
    const result = await cli.run(['method', 'list', '--network', 'atlantis'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Network 'atlantis' is not supported.")
  })
})

describe('the passphrase gate', () => {
  it('stops a module change without the passphrase', async () => {
    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })

    const result = await cli.run(['module', 'disable', '--name', MOONPAY_MODULE])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Cannot prompt for a passphrase when stdin is piped.')

    const { modules } = await cli.json(['module', 'list'])
    expect(modules.find((m) => m.module === MOONPAY_MODULE).status).toBe('ok')
  })
})
