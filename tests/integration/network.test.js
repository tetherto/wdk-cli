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
const TESTNET_COUNT = Object.values(catalog.networks).filter((n) => n.testnet).length
const TOTAL_NETWORKS = Object.keys(catalog.networks).length
const MAINNET_COUNT = TOTAL_NETWORKS - TESTNET_COUNT

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
/** The address this seed derives on any EVM network at index 0. */
const ETHEREUM_0 = '0x405005C7c4422390F4B334F64Cf20E0b767131d0'
const EVM_MODULE = '@tetherto/wdk-wallet-evm'
/** The networks the EVM wallet module backs, all of which it takes down with it. */
const EVM_NETWORKS = Object.entries(catalog.networks)
  .filter(([, entry]) => entry.module === EVM_MODULE)
  .map(([name]) => name)
const DAI = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'

/** A custom EVM network with its native asset declared inline. */
const SPEC = JSON.stringify({
  network: 'optimism',
  module: EVM_MODULE,
  displayName: 'Optimism',
  config: { provider: 'https://mainnet.optimism.io', chainId: 10 },
  tokens: [{ token: 'eth', symbol: 'ETH', decimals: 18, isNative: true }]
})

/** @type {Cli} */
let cli

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

describe('network list', () => {
  it('lists every packaged network with its native asset', async () => {
    const { networks, count } = await cli.json(['network', 'list'])

    expect(networks).toHaveLength(TOTAL_NETWORKS)
    expect(count).toBe(TOTAL_NETWORKS)
    expect(networks.every((n) => n.enabled)).toBe(true)
    expect(networks.find((n) => n.name === 'ethereum')).toEqual({
      name: 'ethereum',
      displayName: 'Ethereum',
      module: EVM_MODULE,
      type: EVM_MODULE,
      symbol: 'ETH',
      decimals: 18,
      testnet: false,
      custom: false,
      enabled: true
    })
  })

  it('splits the catalog into testnets and mainnets', async () => {
    const testnets = await cli.json(['network', 'list', '--testnet'])
    const mainnets = await cli.json(['network', 'list', '--mainnet'])

    expect(testnets.networks).toHaveLength(TESTNET_COUNT)
    expect(testnets.networks.every((n) => n.testnet)).toBe(true)
    expect(mainnets.networks).toHaveLength(MAINNET_COUNT)
    expect(mainnets.networks.every((n) => !n.testnet)).toBe(true)
  })
})

describe('network create', () => {
  it('fills the defaults a minimal spec leaves out', async () => {
    const created = await cli.json([
      'network', 'create', JSON.stringify({ network: 'optimism', module: EVM_MODULE })
    ], { unlocked: true })

    expect(created).toEqual({
      name: 'optimism',
      displayName: 'optimism',
      type: EVM_MODULE,
      module: EVM_MODULE,
      custom: true,
      testnet: false,
      config: {},
      tokens: []
    })

    const { networks, count } = await cli.json(['network', 'list'])
    expect(count).toBe(TOTAL_NETWORKS + 1)
    expect(networks.find((n) => n.name === 'optimism').custom).toBe(true)
  })

  it('derives on the real module, not a registry stub', async () => {
    await cli.json(['network', 'create', SPEC], { unlocked: true })
    await importAndUnlock()

    const derived = await cli.json(['get', 'address', '--network', 'optimism'], { unlocked: true })

    // Same module and BIP-44 path as the packaged EVM networks, so the same
    // seed must produce the same address. A registry entry alone could not.
    expect(derived.address).toBe(ETHEREUM_0)
    expect(derived.index).toBe(0)
  })

  it('registers the tokens declared in its spec', async () => {
    await cli.json(['network', 'create', SPEC], { unlocked: true })

    const { tokens } = await cli.json(['token', 'list', '--network', 'optimism'])

    expect(Object.keys(tokens)).toEqual(['eth'])
    expect(tokens.eth.symbol).toBe('ETH')
    expect(tokens.eth.isNative).toBe(true)
  })

  it('reads the spec from a file as well as from the argument', async () => {
    const path = join(cli.configHome, 'optimism.json')
    writeFileSync(path, SPEC)

    const created = await cli.json(['network', 'create', path], { unlocked: true })

    expect(created.name).toBe('optimism')
    expect(created.config).toEqual({ provider: 'https://mainnet.optimism.io', chainId: 10 })
  })

  // The spec is validated in full before anything is written, so this covers
  // fail-fast validation. The rollback in the catch block — a token that passes
  // validation but fails on save — is a separate path and is NOT covered here.
  it('writes nothing when a token in the spec is rejected', async () => {
    const bad = JSON.stringify({
      network: 'optimism',
      module: EVM_MODULE,
      tokens: [
        { token: 'eth', symbol: 'ETH', decimals: 18, isNative: true },
        { token: 'bad', symbol: 'BAD', decimals: 6, isNative: false }
      ]
    })

    const result = await cli.run(['network', 'create', bad], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain('Non-native tokens require an "address".')

    const { networks } = await cli.json(['network', 'list'])
    expect(networks.find((n) => n.name === 'optimism')).toBeUndefined()
  })

  it('refuses a network name that already exists', async () => {
    const result = await cli.run(['network', 'create', JSON.stringify({
      network: 'ethereum', module: EVM_MODULE, displayName: 'X'
    })])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Network 'ethereum' already exists.")
  })

  it('refuses a module that is not a wallet module', async () => {
    const result = await cli.run(['network', 'create', JSON.stringify({
      network: 'mychain', module: MOONPAY_MODULE, displayName: 'Mine'
    })])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Network spec "module" must be one of')
  })
})

describe('network info', () => {
  it('shows a packaged network with the configuration it ships', async () => {
    const info = await cli.json(['network', 'info', '--network', 'ethereum'])

    expect(info).toEqual({
      name: 'ethereum',
      displayName: 'Ethereum',
      type: EVM_MODULE,
      module: EVM_MODULE,
      nativeSymbol: 'ETH',
      decimals: 18,
      testnet: false,
      enabled: true,
      config: catalog.networks.ethereum.config
    })
  })

  it('shows a custom network with the configuration from its spec', async () => {
    await cli.json(['network', 'create', SPEC], { unlocked: true })

    const info = await cli.json(['network', 'info', '--network', 'optimism'])

    expect(info).toEqual({
      name: 'optimism',
      displayName: 'Optimism',
      type: EVM_MODULE,
      module: EVM_MODULE,
      custom: true,
      testnet: false,
      // Resolved from the token the spec registered, not from the spec itself.
      nativeSymbol: 'ETH',
      decimals: 18,
      enabled: true,
      config: { provider: 'https://mainnet.optimism.io', chainId: 10 }
    })
  })

  it('reports a network that is not registered', async () => {
    const result = await cli.run(['network', 'info', '--network', 'atlantis'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Network 'atlantis' is not supported.")
  })
})

describe('network disable', () => {
  it('flags the network in the listing and in its own info', async () => {
    const disabled = await cli.json(['network', 'disable', '--name', 'polygon'])

    expect(disabled).toEqual({
      network: 'polygon',
      enabled: false,
      stale: false,
      walletsLocked: false
    })

    const { networks } = await cli.json(['network', 'list'])
    expect(networks.find((n) => n.name === 'polygon').enabled).toBe(false)

    const info = await cli.json(['network', 'info', '--network', 'polygon'])
    expect(info.enabled).toBe(false)
  })

  it('refuses one that is already disabled', async () => {
    await cli.json(['network', 'disable', '--name', 'polygon'])

    const again = await cli.run(['network', 'disable', '--name', 'polygon'])

    expect(again.code).toBe(1)
    expect(again.output).toContain("'polygon' is already disabled.")
  })

  it('sends a module name to the module command and an unknown name to the listing', async () => {
    const asModule = await cli.run(['network', 'disable', '--name', EVM_MODULE])

    expect(asModule.code).toBe(1)
    expect(asModule.output).toContain(`'${EVM_MODULE}' is not a network.`)
    expect(asModule.output).toContain(`wdk module disable --name ${EVM_MODULE}`)

    const unknown = await cli.run(['network', 'disable', '--name', 'atlantis'])

    expect(unknown.code).toBe(1)
    expect(unknown.output).toContain("'atlantis' is not a network.")
    expect(unknown.output).toContain('See network names with: wdk network list')
  })
})

describe('network enable', () => {
  it('brings a disabled network back', async () => {
    await cli.json(['network', 'disable', '--name', 'polygon'])

    const enabled = await cli.json(['network', 'enable', '--name', 'polygon'])

    expect(enabled).toEqual({
      network: 'polygon',
      enabled: true,
      stale: false,
      walletsLocked: false
    })
    const { networks } = await cli.json(['network', 'list'])
    expect(networks.find((n) => n.name === 'polygon').enabled).toBe(true)
  })

  it('clears an override left behind by a network that no longer exists', async () => {
    // Nothing the CLI still knows about answers to this name, so enabling it
    // can only mean discarding the override: there is no entry to switch on.
    cli.writeConfig({ overrides: { networks: { atlantis: { enabled: false } } } })

    const result = await cli.json(['network', 'enable', '--name', 'atlantis'])

    expect(result).toEqual({
      network: 'atlantis',
      enabled: true,
      stale: true,
      walletsLocked: false
    })
    expect(cli.readConfig().overrides).toBeUndefined()
  })
})

describe('network delete', () => {
  it('takes its custom tokens with it', async () => {
    await cli.json(['network', 'create', SPEC], { unlocked: true })
    await cli.json(['token', 'add', JSON.stringify({
      network: 'optimism', token: 'dai', symbol: 'DAI', decimals: 18, isNative: false, address: DAI
    })], { unlocked: true })

    await cli.json(['network', 'delete', '--name', 'optimism'], { unlocked: true })
    await cli.json(['network', 'create', SPEC], { unlocked: true })

    // Recreated under the same name: only the spec's own token may come back.
    const { tokens } = await cli.json(['token', 'list', '--network', 'optimism'])
    expect(Object.keys(tokens)).toEqual(['eth'])
  })

  it('takes the disabled flag with it, so the name comes back enabled', async () => {
    await cli.json(['network', 'create', SPEC], { unlocked: true })
    await cli.json(['network', 'disable', '--name', 'optimism'], { unlocked: true })

    await cli.json(['network', 'delete', '--name', 'optimism'], { unlocked: true })

    expect(cli.readConfig().overrides).toBeUndefined()
    await cli.json(['network', 'create', SPEC], { unlocked: true })
    const { networks } = await cli.json(['network', 'list'])
    expect(networks.find((n) => n.name === 'optimism').enabled).toBe(true)
  })

  it('refuses to delete a packaged network', async () => {
    const result = await cli.run(['network', 'delete', '--name', 'ethereum'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("'ethereum' is a built-in network and cannot be deleted.")
  })
})

describe('networks hidden by a disabled module', () => {
  it('takes down every network on that module and leaves the others alone', async () => {
    const before = await cli.json(['network', 'list'])
    expect(before.networks).toHaveLength(TOTAL_NETWORKS)

    await cli.json(['module', 'disable', '--name', EVM_MODULE], { unlocked: true })

    const { networks } = await cli.json(['network', 'list'])
    const names = networks.map((n) => n.name)
    expect(networks).toHaveLength(TOTAL_NETWORKS - EVM_NETWORKS.length)
    for (const network of EVM_NETWORKS) expect(names).not.toContain(network)
    expect(names).toContain('solana')
  })

  it('takes a custom network on that module down with it, and brings it back', async () => {
    await cli.json(['network', 'create', SPEC], { unlocked: true })

    await cli.json(['module', 'disable', '--name', EVM_MODULE], { unlocked: true })
    const hidden = await cli.json(['network', 'list'])
    expect(hidden.networks.find((n) => n.name === 'optimism')).toBeUndefined()

    await cli.json(['module', 'enable', '--name', EVM_MODULE], { unlocked: true })
    const back = await cli.json(['network', 'list'])
    expect(back.networks.find((n) => n.name === 'optimism').enabled).toBe(true)
  })

  it('hides a network the user disabled, then hands it back still disabled', async () => {
    await cli.json(['network', 'disable', '--name', 'arbitrum'], { unlocked: true })
    const flagged = await cli.json(['network', 'list'])
    expect(flagged.networks.find((n) => n.name === 'arbitrum').enabled).toBe(false)

    // A network the module hides is not listed at all: the module is what you
    // re-enable, so its own disabled flag has nothing to say until then.
    await cli.json(['module', 'disable', '--name', EVM_MODULE], { unlocked: true })
    const hidden = await cli.json(['network', 'list'])
    expect(hidden.networks.find((n) => n.name === 'arbitrum')).toBeUndefined()

    await cli.json(['module', 'enable', '--name', EVM_MODULE], { unlocked: true })
    const { networks } = await cli.json(['network', 'list'])
    expect(networks).toHaveLength(TOTAL_NETWORKS)
    expect(networks.find((n) => n.name === 'arbitrum').enabled).toBe(false)
    expect(networks.find((n) => n.name === 'ethereum').enabled).toBe(true)
  })

  it('tells every command that touches the network to enable the module', async () => {
    await cli.json(['module', 'disable', '--name', EVM_MODULE], { unlocked: true })

    for (const args of [
      ['network', 'info', '--network', 'ethereum'],
      ['token', 'list', '--network', 'ethereum'],
      ['method', 'list', '--network', 'ethereum']
    ]) {
      const result = await cli.run(args, { unlocked: true })

      expect(result.code).toBe(1)
      expect(result.output).toContain("Network 'ethereum' is disabled.")
      expect(result.output).toContain(`wdk module enable --name ${EVM_MODULE}`)
    }
  })

  it('refuses to re-enable the network on its own', async () => {
    await cli.json(['module', 'disable', '--name', EVM_MODULE], { unlocked: true })

    const result = await cli.run(['network', 'enable', '--name', 'ethereum'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain("Network 'ethereum' is disabled by its module.")
  })
})

describe('the passphrase gate', () => {
  it('stops a network change without the passphrase', async () => {
    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })

    const result = await cli.run(['network', 'disable', '--name', 'ethereum'])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Cannot prompt for a passphrase when stdin is piped.')

    const { networks } = await cli.json(['network', 'list'])
    expect(networks.find((n) => n.name === 'ethereum').enabled).toBe(true)
  })
})
