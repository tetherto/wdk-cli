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
import { Cli } from './helpers.js'

const catalog = createRequire(import.meta.url)('../../wdk.config.json')
const TOTAL_NETWORKS = Object.keys(catalog.networks).length

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const EVM_MODULE = '@tetherto/wdk-wallet-evm'
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const OVERRIDE_ADDRESS = '0x1111111111111111111111111111111111111111'

/** The packaged `ethereum/usdt` mappings, which the slug deltas merge into. */
const USDT_SLUGS = {
  indexer: 'usdt',
  moonpay: 'usdt',
  bitfinex: 'UST',
  transak: { slug: 'USDT', network: 'ethereum' }
}

/**
 * A token the packaged registry does not carry. Deliberately carries no
 * `metadata.slugs`: the resolution tests below reach a provider with it, and a
 * mapped token would send a real request.
 */
const CUSTOM_TOKEN = JSON.stringify({
  network: 'ethereum', token: 'dai', symbol: 'DAI', decimals: 18, isNative: false, address: DAI
})

/** An entry under a packaged key, to override it. */
const OVERRIDE = JSON.stringify({
  network: 'ethereum', token: 'usdt', symbol: 'USDT2', decimals: 8, isNative: false,
  address: OVERRIDE_ADDRESS
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

describe('token list', () => {
  it('lists the packaged tokens of one network', async () => {
    const { tokens, disabled } = await cli.json(['token', 'list', '--network', 'ethereum'])

    expect(Object.keys(tokens)).toEqual(['eth', 'usdt', 'xaut'])
    expect(tokens.eth.isNative).toBe(true)
    expect(tokens.usdt.address).toBe(USDT)
    expect(disabled).toEqual([])
  })

  it('covers every network when none is named, minus the ones the user switched off', async () => {
    const all = await cli.json(['token', 'list'])
    expect(Object.keys(all.tokens)).toHaveLength(TOTAL_NETWORKS)
    expect(Object.keys(all.tokens)).toContain('ethereum')

    await cli.json(['network', 'disable', '--name', 'ethereum'], { unlocked: true })

    const { tokens } = await cli.json(['token', 'list'])
    expect(Object.keys(tokens)).toHaveLength(TOTAL_NETWORKS - 1)
    expect(Object.keys(tokens)).not.toContain('ethereum')
  })

  it('refuses a network the catalog does not carry', async () => {
    const result = await cli.run(['token', 'list', '--network', 'atlantis'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Network 'atlantis' is not supported.")
  })
})

describe('token info', () => {
  it('shows a packaged token with its external mappings', async () => {
    const info = await cli.json(['token', 'info', '--network', 'ethereum', '--token', 'usdt'])

    expect(info).toEqual({
      network: 'ethereum',
      token: 'usdt',
      enabled: true,
      symbol: 'USDT',
      decimals: 6,
      isNative: false,
      address: USDT,
      metadata: { slugs: USDT_SLUGS }
    })
  })

  it('refuses a token the registry does not carry', async () => {
    const result = await cli.run(['token', 'info', '--network', 'ethereum', '--token', 'nope'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Token 'nope' not found on 'ethereum'.")
  })
})

describe('token add', () => {
  it('adds a custom token alongside the packaged ones', async () => {
    const added = await cli.json(['token', 'add', CUSTOM_TOKEN])

    expect(added).toEqual({
      network: 'ethereum', token: 'dai', added: true,
      symbol: 'DAI', decimals: 18, isNative: false, address: DAI
    })

    const { tokens } = await cli.json(['token', 'list', '--network', 'ethereum'])
    expect(Object.keys(tokens)).toEqual(['eth', 'usdt', 'xaut', 'dai'])

    // The entry has to land where every other command reads custom tokens from.
    expect(cli.readConfig().customTokens.ethereum.dai)
      .toEqual({ symbol: 'DAI', decimals: 18, isNative: false, address: DAI })
  })

  it('keeps the external mappings the spec declares', async () => {
    await cli.json(['token', 'add', JSON.stringify({
      network: 'ethereum', token: 'link', symbol: 'LINK', decimals: 18, isNative: false,
      address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      metadata: { slugs: { indexer: 'link', transak: { slug: 'LINK', network: 'ethereum' } } }
    })])

    const info = await cli.json(['token', 'info', '--network', 'ethereum', '--token', 'link'])

    expect(info.metadata).toEqual({
      slugs: { indexer: 'link', transak: { slug: 'LINK', network: 'ethereum' } }
    })
  })

  it('rejects a malformed spec without writing anything', async () => {
    const rejected = [
      [
        { network: 'ethereum', token: 'bad', symbol: 'BAD', decimals: 25, isNative: false, address: DAI },
        'Token "decimals" must be an integer between 0 and 24.'
      ],
      [
        { network: 'ethereum', token: 'bad', symbol: 'BAD', decimals: 6, isNative: 'no', address: DAI },
        'Token "isNative" must be a boolean.'
      ],
      [
        { network: 'ethereum', token: 'BAD', symbol: 'BAD', decimals: 6, isNative: false, address: DAI },
        "Invalid token name 'BAD'."
      ],
      [
        {
          network: 'ethereum',
          token: 'bad',
          symbol: 'BAD',
          decimals: 6,
          isNative: false,
          address: DAI,
          metadata: { slugs: { transak: { network: 'ethereum' } } }
        },
        'Token "metadata.slugs.transak" is missing "slug".'
      ],
      [
        {
          network: 'ethereum',
          token: 'bad',
          symbol: 'BAD',
          decimals: 6,
          isNative: false,
          address: DAI,
          metadata: { indexerSlug: 'bad' }
        },
        'Token "metadata" has unknown field(s): indexerSlug.'
      ]
    ]

    for (const [spec, message] of rejected) {
      const result = await cli.run(['token', 'add', JSON.stringify(spec)])

      expect(result.code).toBe(1)
      expect(result.output).toContain(message)
    }

    expect(cli.readConfig().customTokens).toBeUndefined()
  })

  it('overrides a packaged entry under the same key, warning that it did', async () => {
    const result = await cli.run(['token', 'add', OVERRIDE])

    expect(result.code).toBe(0)
    expect(result.output).toContain(
      "Warning: 'usdt' is a built-in token on 'ethereum'. This entry now overrides it. " +
      'Run `wdk token delete` to revert.'
    )

    // One entry, not two: the override replaces the packaged fields wholesale,
    // so the packaged slugs go with them.
    const { tokens } = await cli.json(['token', 'list', '--network', 'ethereum'])
    expect(Object.keys(tokens)).toEqual(['eth', 'usdt', 'xaut'])
    expect(tokens.usdt).toEqual({
      symbol: 'USDT2', decimals: 8, isNative: false, address: OVERRIDE_ADDRESS
    })
  })

  it('refuses a second native token, but takes a replacement for the one there', async () => {
    const second = await cli.run(['token', 'add', JSON.stringify({
      network: 'ethereum', token: 'weth', symbol: 'WETH', decimals: 18, isNative: true
    })])

    expect(second.code).toBe(1)
    expect(second.output).toContain(
      "Network 'ethereum' already has native token 'eth' (ETH). " +
      "Each network can have at most one native token. Delete 'eth' first if you want to replace it."
    )

    const replaced = await cli.json(['token', 'add', JSON.stringify({
      network: 'ethereum', token: 'eth', symbol: 'ETH2', decimals: 18, isNative: true
    })])

    expect(replaced.added).toBe(true)
    expect(replaced.overridesBuiltin).toBe(true)
    expect(replaced.symbol).toBe('ETH2')
  })
})

describe('token delete', () => {
  it('deletes a custom token, taking its disable override with it', async () => {
    await cli.json(['token', 'add', CUSTOM_TOKEN])
    await cli.json(['token', 'disable', '--network', 'ethereum', '--token', 'dai'])

    const deleted = await cli.json(['token', 'delete', '--network', 'ethereum', '--token', 'dai'])
    expect(deleted).toEqual({ network: 'ethereum', token: 'dai', deleted: true })

    // A leftover override would re-disable the token if it were added again.
    const { tokens, disabled } = await cli.json(['token', 'list', '--network', 'ethereum'])
    expect(Object.keys(tokens)).toEqual(['eth', 'usdt', 'xaut'])
    expect(disabled).toEqual([])
  })

  it('reverts to the packaged entry when an override is deleted', async () => {
    await cli.json(['token', 'add', OVERRIDE])

    const deleted = await cli.json(['token', 'delete', '--network', 'ethereum', '--token', 'usdt'])
    expect(deleted.revertedToBuiltin).toBe(true)

    const info = await cli.json(['token', 'info', '--network', 'ethereum', '--token', 'usdt'])
    expect(info.symbol).toBe('USDT')
    expect(info.decimals).toBe(6)
    expect(info.address).toBe(USDT)
  })

  it('refuses a packaged token, pointing at the override instead', async () => {
    const result = await cli.run(['token', 'delete', '--network', 'ethereum', '--token', 'usdt'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("'usdt' on 'ethereum' is a built-in token and cannot be deleted.")
    expect(result.output).toContain('Use `wdk token add` to override its fields instead.')
  })
})

describe('token disable', () => {
  it('flags the token in the listing and in its own info', async () => {
    await cli.json(['token', 'disable', '--network', 'ethereum', '--token', 'usdt'])

    // Still listed — the listing reports it as disabled rather than hiding it.
    const { tokens, disabled } = await cli.json(['token', 'list', '--network', 'ethereum'])
    expect(Object.keys(tokens)).toEqual(['eth', 'usdt', 'xaut'])
    expect(disabled).toEqual(['ethereum/usdt'])

    const info = await cli.json(['token', 'info', '--network', 'ethereum', '--token', 'usdt'])
    expect(info.enabled).toBe(false)
  })

  it("refuses the network's native token", async () => {
    const result = await cli.run(['token', 'disable', '--network', 'ethereum', '--token', 'eth'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("'eth' is the native token of 'ethereum'.")
    expect(result.output).toContain('wdk network disable --name ethereum')
  })
})

describe('token enable', () => {
  it('brings a disabled token back', async () => {
    await cli.json(['token', 'disable', '--network', 'ethereum', '--token', 'usdt'])

    const enabled = await cli.json(['token', 'enable', '--network', 'ethereum', '--token', 'usdt'])
    expect(enabled).toEqual({
      network: 'ethereum', token: 'usdt', enabled: true, stale: false, walletsLocked: false
    })

    const { disabled } = await cli.json(['token', 'list', '--network', 'ethereum'])
    expect(disabled).toEqual([])
  })
})

describe('a registry the user edited by hand', () => {
  // `overrides.tokens.<id>.metadata.slugs` is written with `wdk config set`,
  // which does not validate it, so both halves below come straight from config.
  it('merges slug deltas one system at a time', async () => {
    cli.writeConfig({
      overrides: {
        tokens: {
          'ethereum/usdt': { metadata: { slugs: { moonpay: 'usdt_custom', myexchange: 'UST9' } } },
          'ethereum/xaut': { metadata: { slugs: { indexer: { note: 'no slug here' } } } }
        }
      }
    })

    const usdt = await cli.json(['token', 'info', '--network', 'ethereum', '--token', 'usdt'])
    expect(usdt.metadata.slugs).toEqual({ ...USDT_SLUGS, moonpay: 'usdt_custom', myexchange: 'UST9' })

    // A delta carrying no slug is dropped, not allowed to shadow the packaged one.
    const xaut = await cli.json(['token', 'info', '--network', 'ethereum', '--token', 'xaut'])
    expect(xaut.metadata.slugs.indexer).toBe('xaut')
  })

  it('skips a custom entry the schema rejects and keeps the rest usable', async () => {
    cli.writeConfig({
      customTokens: {
        ethereum: { broken: { symbol: 'BROKEN', decimals: 'six', isNative: false, address: DAI } }
      }
    })

    const result = await cli.run(['token', 'list', '--network', 'ethereum', '--json'])

    expect(result.code).toBe(0)
    expect(result.stderr).toContain("Warning: ignoring invalid custom token 'ethereum/broken'")
    expect(result.stderr).toContain("run 'wdk token delete --network ethereum --token broken'")
    expect(Object.keys(JSON.parse(result.stdout.trim()).tokens)).toEqual(['eth', 'usdt', 'xaut'])
  })
})

describe('a token a command has to resolve', () => {
  // A registry entry that no command can resolve would pass every test above.
  // Pin the provider first: the ambiguity check runs before the token lookup.
  it('resolves a custom token, and reports only the missing provider mapping', async () => {
    await cli.json(['token', 'add', CUSTOM_TOKEN])
    await importAndUnlock()

    const result = await cli.run(
      ['buy', '--network', 'ethereum', '--token', 'dai', '--fiat-amount', '100',
        '--provider', 'moonpay'],
      { unlocked: true }
    )

    // Reached the slug lookup, which only happens once the token resolved.
    expect(result.code).toBe(1)
    expect(result.output).toContain("Token 'dai' on 'ethereum' has no moonpay mapping.")
  })

  it('reports a token that was never registered', async () => {
    await importAndUnlock()

    const result = await cli.run(
      ['buy', '--network', 'ethereum', '--token', 'zzz', '--fiat-amount', '100',
        '--provider', 'moonpay'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain("Unknown token 'zzz' on 'ethereum'.")
  })

  it('stops resolving a token the user disabled', async () => {
    await importAndUnlock()
    await cli.json(['token', 'disable', '--network', 'ethereum', '--token', 'xaut'], { unlocked: true })
    await cli.run(['wallet', 'unlock', '--name', 'main'], { unlocked: true })

    const result = await cli.run(
      ['get', 'balance', '--network', 'ethereum', '--token', 'xaut'], { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain("Token 'xaut' is disabled on 'ethereum'.")
  })
})

describe('a disabled token through network and module cycles', () => {
  it('stays disabled after its network is switched off and on', async () => {
    await cli.json(['token', 'disable', '--network', 'ethereum', '--token', 'usdt'], { unlocked: true })

    await cli.json(['network', 'disable', '--name', 'ethereum'], { unlocked: true })
    await cli.json(['network', 'enable', '--name', 'ethereum'], { unlocked: true })

    const { disabled } = await cli.json(['token', 'list', '--network', 'ethereum'])
    expect(disabled).toEqual(['ethereum/usdt'])
  })

  it('stays disabled after its module is switched off and on', async () => {
    await cli.json(['token', 'disable', '--network', 'ethereum', '--token', 'usdt'], { unlocked: true })

    await cli.json(['module', 'disable', '--name', EVM_MODULE], { unlocked: true })
    await cli.json(['module', 'enable', '--name', EVM_MODULE], { unlocked: true })

    const { disabled } = await cli.json(['token', 'list', '--network', 'ethereum'])
    expect(disabled).toEqual(['ethereum/usdt'])
  })
})

describe('the passphrase gate', () => {
  it('stops a token change without the passphrase', async () => {
    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })

    const result = await cli.run(['token', 'disable', '--network', 'ethereum', '--token', 'usdt'])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Cannot prompt for a passphrase when stdin is piped.')

    const { disabled } = await cli.json(['token', 'list', '--network', 'ethereum'])
    expect(disabled).toEqual([])
  })
})
