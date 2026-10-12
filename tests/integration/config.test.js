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

// The config store itself: where it lives, what it accepts, the file it leaves
// on disk, and what changing it does to an unlocked wallet. Config belonging to
// one registry is tested with that registry; this covers the store every
// command writes through.

import { chmodSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { Cli } from './helpers.js'

const catalog = createRequire(import.meta.url)('../../wdk.config.json')
/** The packaged Ethereum RPC endpoint, which is what `config reset` restores. */
const ETHEREUM_PROVIDER = catalog.networks.ethereum.config.provider

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'

/** A minimally valid custom-token entry, so the token registry passes validation. */
const TOKEN = JSON.stringify({
  symbol: 'MYT',
  address: '0x1111111111111111111111111111111111111111',
  decimals: 6,
  isNative: false
})

/** @type {Cli} */
let cli

beforeEach(() => { cli = new Cli() })
afterEach(async () => {
  // Locking stops the daemon and clears its pid file; without it the tests that
  // unlock leave a daemon behind holding a socket in a deleted directory.
  await cli.run(['wallet', 'lock', '--all'], { unlocked: true })
  cli.cleanup()
})

/**
 * Imports the fixed test seed, so the commands that confirm the passphrase have
 * a default wallet to confirm against.
 *
 * @returns {Promise<void>}
 */
async function importWallet () {
  await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
    unlocked: true,
    stdin: SEED + '\n'
  })
}

describe('config path', () => {
  it('prints the file the store writes through', async () => {
    const result = await cli.run(['config', 'path'])

    expect(result.stdout.trim()).toBe(cli.configPath())
  })
})

describe('config get', () => {
  it('dumps the packaged defaults with --all', async () => {
    const all = await cli.json(['config', 'get', '--all'])

    expect(all.defaultIndex).toBe(0)
    expect(all.networks.ethereum.provider).toBe(ETHEREUM_PROVIDER)
  })

  it('leaves the token registry out of --all', async () => {
    await cli.run(['config', 'set', '--key', 'customTokens.ethereum.MYT', '--value', TOKEN])

    const all = await cli.json(['config', 'get', '--all'])

    expect(Object.keys(all)).not.toContain('customTokens')
    expect(cli.readConfig().customTokens.ethereum.MYT.symbol).toBe('MYT')
  })

  it('reports a key that was never set, and still exits 0', async () => {
    const result = await cli.run(['config', 'get', '--key', 'nope.missing'])

    expect(result.output).toContain("Key 'nope.missing' is not set.")
    expect(result.code).toBe(0)
  })

  it('refuses to run with neither --key, --network nor --all', async () => {
    const result = await cli.run(['config', 'get'])

    expect(result.output).toContain('Error: Either --key, --network, or --all is required.')
    expect(result.code).toBe(1)
  })
})

describe('config set', () => {
  it('parses the value as JSON, so objects, numbers and booleans keep their type', async () => {
    await cli.run(['config', 'set', '--key', 'probe.object', '--value', '{"color":"blue","size":2}'])
    await cli.run(['config', 'set', '--key', 'probe.number', '--value', '42'])
    await cli.run(['config', 'set', '--key', 'probe.boolean', '--value', 'true'])

    expect(cli.readConfig().probe).toEqual({
      object: { color: 'blue', size: 2 },
      number: 42,
      boolean: true
    })
  })

  it('stores a value that is not JSON as the raw string it was given', async () => {
    await cli.run(['config', 'set', '--key', 'probe.spaced', '--value', 'hello world'])
    await cli.run(['config', 'set', '--key', 'probe.empty', '--value', ''])

    expect(cli.readConfig().probe).toEqual({ spaced: 'hello world', empty: '' })
  })

  it('scopes --network to networks.<name>, in both directions', async () => {
    await cli.run(['config', 'set', '--network', 'ethereum', '--key', 'provider', '--value', 'https://scoped.example'])

    expect(cli.readConfig().networks.ethereum.provider).toBe('https://scoped.example')
    expect(await cli.json(['config', 'get', '--network', 'ethereum', '--key', 'provider']))
      .toEqual({ key: 'provider', network: 'ethereum', value: 'https://scoped.example' })
  })

  it('refuses a value with nothing to write it to', async () => {
    const result = await cli.run(['config', 'set', '--value', 'orphan'])

    expect(result.output).toContain('Error: --key is required (or use --network to set network config)')
    expect(result.code).toBe(1)
  })
})

describe('config reset', () => {
  it('restores the packaged default of a key that has one', async () => {
    await cli.run(['config', 'set', '--key', 'networks.ethereum.provider', '--value', 'https://mine.example'])

    await cli.run(['config', 'reset', '--key', 'networks.ethereum.provider'])

    expect((await cli.json(['config', 'get', '--key', 'networks.ethereum.provider'])).value)
      .toBe(ETHEREUM_PROVIDER)
  })

  it('deletes a key the packaged defaults say nothing about', async () => {
    await cli.run(['config', 'set', '--key', 'probe.theme', '--value', 'dark'])

    await cli.run(['config', 'reset', '--key', 'probe.theme'])

    const result = await cli.run(['config', 'get', '--key', 'probe.theme'])
    expect(result.output).toContain("Key 'probe.theme' is not set.")
  })

  it('--all drops plain config but keeps the default wallet and the custom registries', async () => {
    await cli.run(['config', 'set', '--key', 'probe.theme', '--value', 'dark'])
    await cli.run(['config', 'set', '--key', 'defaultWallet', '--value', 'main'])
    await cli.run(['config', 'set', '--key', 'customNetworks.optimism', '--value', '{"chainId":10}'])
    await cli.run(['config', 'set', '--key', 'customProviders.myramp', '--value', '{"module":"x"}'])
    await cli.run(['config', 'set', '--key', 'customTokens.ethereum.MYT', '--value', TOKEN])

    await cli.run(['config', 'reset', '--all'])

    const after = cli.readConfig()
    expect(Object.keys(after)).not.toContain('probe')
    expect(after.defaultWallet).toBe('main')
    expect(after.customNetworks).toEqual({ optimism: { chainId: 10 } })
    expect(after.customProviders).toEqual({ myramp: { module: 'x' } })
    expect(after.customTokens.ethereum.MYT.symbol).toBe('MYT')
  })

  it('refuses --key together with --all', async () => {
    const result = await cli.run(['config', 'reset', '--key', 'probe.theme', '--all'])

    expect(result.output).toContain('Error: --key and --all are mutually exclusive.')
    expect(result.code).toBe(1)
  })
})

describe('config file permissions', () => {
  it('writes the config owner-only', async () => {
    await cli.run(['config', 'set', '--key', 'probe.theme', '--value', 'dark'])

    expect(statSync(cli.configPath()).mode & 0o777).toBe(0o600)
  })

  it('tightens a config an older version left world-readable', async () => {
    await cli.run(['config', 'set', '--key', 'probe.theme', '--value', 'dark'])
    chmodSync(cli.configPath(), 0o644)

    await cli.run(['config', 'set', '--key', 'probe.theme', '--value', 'light'])

    expect(statSync(cli.configPath()).mode & 0o777).toBe(0o600)
  })

  it('tightens a world-readable config directory on the next command', async () => {
    await cli.run(['config', 'set', '--key', 'probe.theme', '--value', 'dark'])
    chmodSync(dirname(cli.configPath()), 0o755)

    await cli.run(['config', 'path'])

    expect(statSync(dirname(cli.configPath())).mode & 0o777).toBe(0o700)
  })
})

describe('the passphrase gate on config set', () => {
  it('refuses the write when the passphrase is wrong', async () => {
    await importWallet()

    const result = await cli.run(
      ['config', 'set', '--key', 'probe.theme', '--value', 'dark'],
      { passphrase: 'not-the-passphrase' }
    )

    expect(result.output).toContain('Error: Incorrect passphrase.')
    expect(result.code).toBe(1)
    expect(Object.keys(cli.readConfig())).not.toContain('probe')
  })

  it('does not gate reads behind the passphrase', async () => {
    await importWallet()

    const result = await cli.run(['config', 'get', '--key', 'defaultIndex'])

    expect(result.stdout.trim()).toBe('0')
    expect(result.code).toBe(0)
  })
})

describe('the wallet lock a config change forces', () => {
  it('locks the unlocked wallets when a networks.* key changes', async () => {
    await importWallet()
    await cli.run(['wallet', 'unlock', '--name', 'main'], { unlocked: true })

    const result = await cli.json(
      ['config', 'set', '--key', 'networks.ethereum.provider', '--value', 'https://mine.example'],
      { unlocked: true }
    )

    expect(result).toEqual({
      key: 'networks.ethereum.provider',
      value: 'https://mine.example',
      success: true,
      walletsLocked: true
    })
    expect((await cli.json(['wallet', 'list'])).wallets).toEqual([
      { name: 'main', default: true, unlocked: false }
    ])
  })

  it('leaves the wallets unlocked when an unrelated key changes', async () => {
    await importWallet()
    await cli.run(['wallet', 'unlock', '--name', 'main'], { unlocked: true })

    const result = await cli.json(
      ['config', 'set', '--key', 'probe.theme', '--value', 'dark'],
      { unlocked: true }
    )

    expect(result).toEqual({
      key: 'probe.theme',
      value: 'dark',
      success: true,
      walletsLocked: false
    })
    expect((await cli.json(['wallet', 'list'])).wallets[0].unlocked).toBe(true)
  })
})
