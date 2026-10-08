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

import { Cli } from './helpers.js'

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const ETHEREUM_0 = '0x405005C7c4422390F4B334F64Cf20E0b767131d0'

/** A second valid BIP-39 phrase, for telling one wallet's keys from another's. */
const OTHER_SEED = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const OTHER_ETHEREUM_0 = '0x58A57ed9d8d624cBD12e2C467D34787555bB1b25'

const EVM_MODULE = '@tetherto/wdk-wallet-evm'
/** A module behind no network, so disabling it touches no wallet key. */
const PRICING_MODULE = '@tetherto/wdk-pricing-bitfinex-http'

/** The default session length, in milliseconds. */
const DEFAULT_TTL_MS = 300_000

/** @type {Cli} */
let cli

beforeEach(() => {
  cli = new Cli()
})

afterEach(async () => {
  await cli.run(['wallet', 'lock', '--all'], { unlocked: true })
  cli.cleanup()
})

/**
 * Imports a seed under a name and unlocks it.
 *
 * @param {string} [name] - The wallet name.
 * @param {string} [seed] - The seed phrase to import.
 * @returns {Promise<void>}
 */
async function importAndUnlock (name = 'main', seed = SEED) {
  await cli.run(['wallet', 'import', '--name', name, '--seed-stdin'], {
    unlocked: true,
    stdin: seed + '\n'
  })
  await cli.run(['wallet', 'unlock', '--name', name], { unlocked: true })
}

describe('wallet create', () => {
  it('generates a twelve word seed phrase', async () => {
    const created = await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    expect(created.wallet).toBe('w1')
    expect(created.seedPhrase.split(' ')).toHaveLength(12)
  })

  it('generates a twenty-four word seed phrase when asked', async () => {
    const created = await cli.json(
      ['wallet', 'create', '--name', 'w1', '--words', '24'], { unlocked: true }
    )

    expect(created.seedPhrase.split(' ')).toHaveLength(24)
  })

  it('makes the first wallet the default and the second not', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })
    await cli.json(['wallet', 'create', '--name', 'w2'], { unlocked: true })

    const { wallets } = await cli.json(['wallet', 'list'])

    expect(wallets.filter((w) => w.default).map((w) => w.name)).toEqual(['w1'])
  })

  it('refuses a name already taken', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    const again = await cli.run(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    expect(again.code).toBe(1)
    expect(again.output).toContain("Wallet 'w1' already exists.")
  })

  it('refuses a word count that is not 12 or 24', async () => {
    const result = await cli.run(
      ['wallet', 'create', '--name', 'w1', '--words', '18'], { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain('--words must be 12 or 24')
  })

  // The name reaches the filesystem, so anything but a plain identifier is out.
  it.each(['a b', '../evil', ''])('refuses the name %p', async (name) => {
    const result = await cli.run(['wallet', 'create', '--name', name], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain(`Invalid wallet name: '${name}'.`)
  })

  it('cannot prompt for a passphrase when stdin is piped', async () => {
    const result = await cli.run(['wallet', 'create', '--name', 'w1'])

    expect(result.code).toBe(1)
    expect(result.output).toContain('Cannot prompt for a passphrase when stdin is piped.')
  })
})

describe('wallet import', () => {
  it('imports a known seed', async () => {
    await importAndUnlock()

    const { wallets } = await cli.json(['wallet', 'list'])

    expect(wallets).toHaveLength(1)
    expect(wallets[0]).toMatchObject({ name: 'main', default: true, unlocked: true })
  })

  it('refuses a seed that is not valid BIP-39', async () => {
    const result = await cli.run(['wallet', 'import', '--name', 'bad', '--seed-stdin'], {
      unlocked: true,
      stdin: 'not a real seed phrase at all here friend\n'
    })

    expect(result.code).toBe(1)
    expect(result.output).toContain('Invalid seed phrase. Must be 12 or 24 valid BIP-39 words.')
  })

  it('refuses a name already taken', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    const result = await cli.run(['wallet', 'import', '--name', 'w1', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })

    expect(result.code).toBe(1)
    expect(result.output).toContain("Wallet 'w1' already exists.")
  })
})

describe('wallet unlock and the session it opens', () => {
  it('opens a session of the default length', async () => {
    await importAndUnlock()

    const { wallets } = await cli.json(['wallet', 'list'])

    expect(wallets[0]).toMatchObject({ unlocked: true, ttlMs: DEFAULT_TTL_MS })
    expect(wallets[0].ttlRemaining).toBeLessThanOrEqual(DEFAULT_TTL_MS)
  })

  it('opens a session for the number of minutes it was given', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    const unlocked = await cli.json(
      ['wallet', 'unlock', '--name', 'w1', '--ttl', '2'], { unlocked: true }
    )

    expect(unlocked).toMatchObject({ wallet: 'w1', unlocked: true, alreadyUnlocked: false, ttl: 2 })
  })

  it('treats a ttl of zero as unlimited', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    const unlocked = await cli.json(
      ['wallet', 'unlock', '--name', 'w1', '--ttl', '0'], { unlocked: true }
    )

    expect(unlocked.ttl).toBe(0)
    expect(unlocked.unlocked).toBe(true)
  })

  // The ttl decides how long a decrypted seed stays in memory, so a value that
  // cannot be honoured has to be rejected rather than rounded into something.
  it.each(['-5', 'abc'])('refuses a ttl of %p', async (ttl) => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    const result = await cli.run(
      ['wallet', 'unlock', '--name', 'w1', '--ttl', ttl], { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain(
      `option '--ttl <minutes>' argument '${ttl}' is invalid. Must be a non-negative integer.`
    )
  })

  it('reports a wallet that was already unlocked, rather than failing', async () => {
    await importAndUnlock()

    const again = await cli.json(['wallet', 'unlock', '--name', 'main'], { unlocked: true })

    expect(again).toMatchObject({ wallet: 'main', unlocked: true, alreadyUnlocked: true })
  })

  it('refuses the wrong passphrase', async () => {
    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })

    const result = await cli.run(['wallet', 'unlock', '--name', 'main'], { passphrase: 'wrong-one' })

    expect(result.code).toBe(1)
    expect(result.output).toContain('Incorrect passphrase.')
  })

  it('reports a wallet that does not exist', async () => {
    const result = await cli.run(['wallet', 'unlock', '--name', 'ghost'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain("Wallet 'ghost' not found.")
  })
})

describe('wallet lock', () => {
  it('locks one wallet by name', async () => {
    await importAndUnlock()

    await cli.run(['wallet', 'lock', '--name', 'main'], { unlocked: true })
    const { wallets } = await cli.json(['wallet', 'list'])

    expect(wallets[0].unlocked).toBe(false)
  })

  it('locks every wallet at once', async () => {
    await importAndUnlock('w1')
    await importAndUnlock('w2')

    await cli.run(['wallet', 'lock', '--all'], { unlocked: true })
    const { wallets } = await cli.json(['wallet', 'list'])

    expect(wallets).toHaveLength(2)
    expect(wallets.every((w) => !w.unlocked)).toBe(true)
  })

  it('succeeds on a wallet that was not unlocked', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    const result = await cli.run(['wallet', 'lock', '--name', 'w1'], { unlocked: true })

    expect(result.code).toBe(0)
    expect(result.output).toContain("Wallet 'w1' is already locked.")
  })

  it('requires a target', async () => {
    const result = await cli.run(['wallet', 'lock'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain('Provide --name <name> or --all.')
  })
})

describe('wallet export', () => {
  it('returns exactly the seed that was imported', async () => {
    await importAndUnlock()

    const exported = await cli.json(['wallet', 'export', '--name', 'main'], { unlocked: true })

    expect(exported.seedPhrase).toBe(SEED)
  })

  it('refuses without the passphrase, printing no part of the seed', async () => {
    await importAndUnlock()

    const result = await cli.run(['wallet', 'export', '--name', 'main'])

    expect(result.code).toBe(1)
    expect(result.output).not.toContain('cook voyage')
  })

  it('reports a wallet that does not exist', async () => {
    const result = await cli.run(['wallet', 'export', '--name', 'ghost'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain("Wallet 'ghost' not found.")
  })
})

describe('wallet list', () => {
  it('reports an empty registry before any wallet exists', async () => {
    const result = await cli.json(['wallet', 'list'])

    expect(result).toEqual({ wallets: [], count: 0 })
  })

  it('reports a locked wallet without session fields', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    const { wallets, count } = await cli.json(['wallet', 'list'])

    expect(count).toBe(1)
    expect(wallets).toEqual([{ name: 'w1', default: true, unlocked: false }])
  })
})

describe('wallet default', () => {
  it('moves the default to another wallet', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })
    await cli.json(['wallet', 'create', '--name', 'w2'], { unlocked: true })

    await cli.run(['wallet', 'default', '--name', 'w2'], { unlocked: true })
    const { wallets } = await cli.json(['wallet', 'list'])

    expect(wallets.find((w) => w.default).name).toBe('w2')
  })

  it('reports a wallet that does not exist', async () => {
    const result = await cli.run(['wallet', 'default', '--name', 'ghost'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain("Wallet 'ghost' not found.")
  })

  it('derives from the wallet named by --wallet, not the default', async () => {
    await importAndUnlock('w1')
    await importAndUnlock('w2', OTHER_SEED)
    await cli.run(['wallet', 'default', '--name', 'w2'], { unlocked: true })
    await cli.run(['wallet', 'unlock', '--name', 'w1'], { unlocked: true })

    const fromNamed = await cli.json(
      ['get', 'address', '--network', 'ethereum', '--wallet', 'w1'], { unlocked: true }
    )

    expect(fromNamed.address).toBe(ETHEREUM_0)
  })
})

describe('wallet rename', () => {
  it('renames a wallet, keeping it usable', async () => {
    await importAndUnlock('old')

    await cli.run(['wallet', 'rename', '--name', 'old', '--new-name', 'new'], { unlocked: true })
    const { wallets } = await cli.json(['wallet', 'list'])

    expect(wallets.map((w) => w.name)).toEqual(['new'])
  })

  it('carries the default flag to the new name', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    await cli.run(['wallet', 'rename', '--name', 'w1', '--new-name', 'w2'], { unlocked: true })
    const { wallets } = await cli.json(['wallet', 'list'])

    expect(wallets).toEqual([{ name: 'w2', default: true, unlocked: false }])
  })

  it('refuses a name already taken', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })
    await cli.json(['wallet', 'create', '--name', 'w2'], { unlocked: true })

    const result = await cli.run(
      ['wallet', 'rename', '--name', 'w1', '--new-name', 'w2'], { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain("Wallet 'w2' already exists.")
  })
})

describe('wallet delete', () => {
  it('removes the wallet', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    await cli.run(['wallet', 'delete', '--name', 'w1'], { unlocked: true })
    const { wallets } = await cli.json(['wallet', 'list'])

    expect(wallets).toEqual([])
  })

  it('promotes another wallet when the default goes', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })
    await cli.json(['wallet', 'create', '--name', 'w2'], { unlocked: true })

    const deleted = await cli.json(['wallet', 'delete', '--name', 'w1'], { unlocked: true })

    expect(deleted).toMatchObject({ wallet: 'w1', deleted: true, newDefault: 'w2' })
    const { wallets } = await cli.json(['wallet', 'list'])
    expect(wallets).toEqual([{ name: 'w2', default: true, unlocked: false }])
  })

  it('promotes nothing when the last wallet goes', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    const deleted = await cli.json(['wallet', 'delete', '--name', 'w1'], { unlocked: true })

    expect(deleted).toMatchObject({ wallet: 'w1', deleted: true })
    expect(deleted.newDefault).toBeUndefined()
  })

  // The daemon holds the decrypted seed for the length of the session. Deleting
  // the wallet has to end that session: names are reusable, so a surviving one
  // would answer for a wallet the user believes they destroyed.
  it('ends the session, so the same name re-imported starts locked', async () => {
    await importAndUnlock('c')
    await cli.json(['wallet', 'delete', '--name', 'c'], { unlocked: true })

    await cli.run(['wallet', 'import', '--name', 'c', '--seed-stdin'], {
      unlocked: true,
      stdin: OTHER_SEED + '\n'
    })

    const locked = await cli.run(['get', 'address', '--network', 'ethereum'], { unlocked: true })
    expect(locked.code).toBe(1)
    expect(locked.output).toContain("Wallet 'c' is not unlocked.")

    await cli.run(['wallet', 'unlock', '--name', 'c'], { unlocked: true })
    const derived = await cli.json(['get', 'address', '--network', 'ethereum'], { unlocked: true })

    // The new seed's address, never the deleted wallet's.
    expect(derived.address).toBe(OTHER_ETHEREUM_0)
  })
})

describe('wallet change-passphrase', () => {
  it('keeps the seed recoverable under the new passphrase', async () => {
    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })

    const changed = await cli.run(
      ['wallet', 'change-passphrase', '--name', 'main', '--new-passphrase-stdin'],
      { unlocked: true, stdin: 'second-passphrase\n' }
    )
    expect(changed.code).toBe(0)

    const exported = await cli.json(['wallet', 'export', '--name', 'main'], {
      passphrase: 'second-passphrase'
    })

    expect(exported.seedPhrase).toBe(SEED)
  })

  it('stops the old passphrase from working', async () => {
    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })
    await cli.run(
      ['wallet', 'change-passphrase', '--name', 'main', '--new-passphrase-stdin'],
      { unlocked: true, stdin: 'second-passphrase\n' }
    )

    const result = await cli.run(['wallet', 'export', '--name', 'main'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain('Incorrect passphrase.')
  })

  it('reports a wallet that does not exist', async () => {
    const result = await cli.run(
      ['wallet', 'change-passphrase', '--name', 'ghost', '--new-passphrase-stdin'],
      { unlocked: true, stdin: 'second-passphrase\n' }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain("Wallet 'ghost' not found.")
  })
})

describe('a session when a module is disabled', () => {
  it('locks the open wallets when the module backs a network', async () => {
    await importAndUnlock()

    const disabled = await cli.json(['module', 'disable', '--name', EVM_MODULE], { unlocked: true })

    expect(disabled.walletsLocked).toBe(true)
    const { wallets } = await cli.json(['wallet', 'list'])
    expect(wallets).toHaveLength(1)
    expect(wallets[0].unlocked).toBe(false)
  })

  // applyToggle locks unconditionally, so even a price feed that has nothing to
  // do with key derivation costs the user their session. Blunt, but safe: pinning
  // it here means narrowing it later has to be a deliberate change.
  it('locks them even when the module backs no network', async () => {
    await importAndUnlock()

    const disabled = await cli.json(['module', 'disable', '--name', PRICING_MODULE], { unlocked: true })

    expect(disabled.walletsLocked).toBe(true)
    const { wallets } = await cli.json(['wallet', 'list'])
    expect(wallets).toHaveLength(1)
    expect(wallets[0].unlocked).toBe(false)
  })
})

describe('the passphrase gate on other commands', () => {
  // The gate exists to protect the keys, so its behaviour is a wallet concern
  // even though it guards registry commands. Each registry file covers that its
  // own commands are gated; these are the cases about the passphrase itself.
  it('does not ask when there is no wallet to protect', async () => {
    const result = await cli.run(['provider', 'disable', '--name', 'velora'])

    expect(result.code).toBe(0)
    expect(result.output).toContain("Provider 'velora' disabled.")
  })

  it('rejects the wrong passphrase, changing nothing', async () => {
    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })

    const result = await cli.run(['provider', 'disable', '--name', 'velora'], {
      passphrase: 'not-the-passphrase'
    })

    expect(result.code).toBe(1)
    expect(result.output).toContain('Incorrect passphrase.')
    const { providers } = await cli.json(['provider', 'list'])
    expect(providers.find((p) => p.name === 'velora').enabled).toBe(true)
  })

  it('follows the new passphrase after change-passphrase', async () => {
    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })
    await cli.run(
      ['wallet', 'change-passphrase', '--name', 'main', '--new-passphrase-stdin'],
      { unlocked: true, stdin: 'second-passphrase\n' }
    )

    const withOld = await cli.run(['provider', 'disable', '--name', 'velora'], { unlocked: true })
    expect(withOld.code).toBe(1)
    expect(withOld.output).toContain('Incorrect passphrase.')

    const withNew = await cli.run(['provider', 'disable', '--name', 'velora'], {
      passphrase: 'second-passphrase'
    })
    expect(withNew.code).toBe(0)
    expect(withNew.output).toContain("Provider 'velora' disabled.")
  })
})
