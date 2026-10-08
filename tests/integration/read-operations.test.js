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

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'

// Derivation is deterministic, so every address here is the exact value this
// seed produces. A changed constant means the derivation changed.
const ETHEREUM_0 = '0x405005C7c4422390F4B334F64Cf20E0b767131d0'
const ETHEREUM_1 = '0xcC81e04BadA16DEf9e1AFB027B859bec42BE49dB'
const ETHEREUM_3 = '0x74b455D1FE2DD6A23326A8B7bA8e935459754205'
const BITCOIN_0 = 'bc1qxn0te9ecv864wtu53cccjhuuy5dphvem6ykeyr'
const SOLANA_0 = '8fjz5DTqBYENAUfsWLpSF2DBb46DXFcmztNJGLVrFPit'
const TRON_0 = 'TXngH8bVadn9ZWtKBgjKQcqN1GsZ7A1jcb'
const BITCOIN_TESTNET_0 = 'tb1q8dqnpagwt9rtl7k38nuaa2ahf690avzkehv7q6'

// ECDSA over a fixed seed and message is deterministic, so these are exact
// values rather than shapes.
const HELLO_SIGNATURE_0 =
  '0x05c005143100eff1f58be46b0a7fb7fe1a47f20d29d7c14e913dc9ae798e00ab' +
  '6e769cf61784923262ba5bda8f0f5140d661a9b3f14df4d17837dc06dea555ac1b'
const HELLO_SIGNATURE_1 =
  '0xa55303f33be43846f0669a238c2fab3875a3751db963b2bcf813652ed965eacf' +
  '26309379766241b8cdae2675fa59cc5c2c97afab5ef0c83e8d70948cf37ce77f1c'

const SPARK_MODULE = '@tetherto/wdk-wallet-spark'
const EVM_MODULE = '@tetherto/wdk-wallet-evm'

/**
 * Names the registry networks matching a predicate.
 *
 * @param {(network: Record<string, unknown>) => boolean} predicate - The filter.
 * @returns {string[]} The matching network names.
 */
function networkNames (predicate) {
  return Object.entries(catalog.networks).filter(([, n]) => predicate(n)).map(([name]) => name)
}

/**
 * The packaged networks `get address --all` should return, minus the spark
 * ones: see {@link disableSpark}.
 */
const MAINNETS = networkNames((n) => !n.testnet && n.module !== SPARK_MODULE)
const TESTNETS = networkNames((n) => n.testnet && n.module !== SPARK_MODULE)
/** Every EVM mainnet shares one address, which is what makes them a set. */
const EVM_MAINNETS = networkNames((n) => !n.testnet && n.module === EVM_MODULE)

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
 * Imports the fixed test seed under a name and unlocks it.
 *
 * @param {string} [name] - The wallet name.
 * @returns {Promise<void>}
 */
async function importAndUnlock (name = 'main') {
  await cli.run(['wallet', 'import', '--name', name, '--seed-stdin'], {
    unlocked: true,
    stdin: SEED + '\n'
  })
  await unlock(name)
}

/**
 * Unlocks a wallet, failing the test if the session did not open. Every test
 * below reads through an unlocked wallet, so a silent unlock failure would
 * turn each of them into an assertion about the lock message instead.
 *
 * @param {string} [name] - The wallet name.
 * @returns {Promise<void>}
 * @throws {Error} When the unlock command did not succeed.
 */
async function unlock (name = 'main') {
  const result = await cli.run(['wallet', 'unlock', '--name', name], { unlocked: true })
  if (result.code !== 0) throw new Error(`could not unlock '${name}': ${result.output}`)
}

/**
 * Turns off both spark networks, then unlocks the wallet again.
 *
 * Spark derives its address through a remote operator API, so leaving it on
 * ties every `--all` assertion to a remote service — and `get address --all`
 * drops a network it cannot derive without saying so, which surfaces as an
 * off-by-one rather than an error. Disabling a network locks every wallet, so
 * the unlock has to come last.
 *
 * @param {string} [name] - The wallet to unlock again.
 * @returns {Promise<void>}
 */
async function disableSpark (name = 'main') {
  await cli.run(['network', 'disable', '--name', 'spark'], { unlocked: true })
  await cli.run(['network', 'disable', '--name', 'spark-regtest'], { unlocked: true })
  await unlock(name)
}

describe('get address', () => {
  it('derives the address this seed always produces', async () => {
    await importAndUnlock()

    const result = await cli.json(['get', 'address', '--network', 'ethereum'], { unlocked: true })

    expect(result).toEqual({ network: 'ethereum', index: 0, address: ETHEREUM_0 })
  })

  it('derives the account at the index it is given', async () => {
    await importAndUnlock()

    const result = await cli.json(
      ['get', 'address', '--network', 'ethereum', '--index', '1'], { unlocked: true }
    )

    expect(result).toEqual({ network: 'ethereum', index: 1, address: ETHEREUM_1 })
  })

  it('derives every mainnet address in one call', async () => {
    await importAndUnlock()
    await disableSpark()

    const result = await cli.json(['get', 'address', '--all'], { unlocked: true })

    expect(result.type).toBe('mainnet')
    expect(result.index).toBe(0)
    expect(result.addresses.map((a) => a.network)).toEqual(MAINNETS)
    // Every EVM chain is the same key under a different chain id.
    const evm = result.addresses.filter((a) => EVM_MAINNETS.includes(a.network))
    expect(evm).toHaveLength(EVM_MAINNETS.length)
    expect(evm.every((a) => a.address === ETHEREUM_0)).toBe(true)
    expect(result.addresses.find((a) => a.network === 'bitcoin').address).toBe(BITCOIN_0)
    expect(result.addresses.find((a) => a.network === 'solana').address).toBe(SOLANA_0)
    expect(result.addresses.find((a) => a.network === 'tron').address).toBe(TRON_0)
  })

  it('derives testnet addresses instead of mainnet ones with --testnet', async () => {
    await importAndUnlock()
    await disableSpark()

    const result = await cli.json(['get', 'address', '--all', '--testnet'], { unlocked: true })

    expect(result.type).toBe('testnet')
    expect(result.addresses.map((a) => a.network)).toEqual(TESTNETS)
    expect(result.addresses.find((a) => a.network === 'bitcoin-testnet3').address)
      .toBe(BITCOIN_TESTNET_0)
    expect(result.addresses.find((a) => a.network === 'sepolia').address).toBe(ETHEREUM_0)
  })

  it('applies --index to every network of an --all run', async () => {
    await importAndUnlock()
    await disableSpark()

    const result = await cli.json(['get', 'address', '--all', '--index', '3'], { unlocked: true })

    expect(result.index).toBe(3)
    expect(result.addresses).toHaveLength(MAINNETS.length)
    expect(result.addresses.find((a) => a.network === 'ethereum').address).toBe(ETHEREUM_3)
  })

  it('asks for a selector when given neither --network nor --all', async () => {
    await importAndUnlock()

    const result = await cli.run(['get', 'address'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain('Provide --network <network> or --all.')
  })

  it('refuses a network that is not registered', async () => {
    await importAndUnlock()

    const result = await cli.run(['get', 'address', '--network', 'atlantis'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain("Network 'atlantis' is not supported.")
  })

  it('refuses a network the user disabled', async () => {
    await importAndUnlock()
    await cli.run(['network', 'disable', '--name', 'ethereum'], { unlocked: true })
    // Disabling a network locks every wallet, so re-unlock: otherwise this
    // passes on "not unlocked" and proves nothing about the network.
    await unlock()

    const result = await cli.run(['get', 'address', '--network', 'ethereum'], { unlocked: true })

    expect(result.code).toBe(1)
    expect(result.output).toContain("Network 'ethereum' is disabled.")
  })

  it('refuses to derive while locked', async () => {
    await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
      unlocked: true,
      stdin: SEED + '\n'
    })

    const result = await cli.run(['get', 'address', '--network', 'ethereum'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Wallet 'main' is not unlocked.")
  })
})

describe('deriving on a network whose module is disabled', () => {
  it("drops the module's networks from --all and names the module by network", async () => {
    await importAndUnlock()
    await disableSpark()
    await cli.run(['module', 'disable', '--name', EVM_MODULE], { unlocked: true })
    await unlock()

    const all = await cli.json(['get', 'address', '--all'], { unlocked: true })
    const named = await cli.run(['get', 'address', '--network', 'ethereum'], { unlocked: true })

    expect(all.addresses.map((a) => a.network))
      .toEqual(MAINNETS.filter((n) => !EVM_MAINNETS.includes(n)))
    expect(all.addresses.find((a) => a.network === 'solana').address).toBe(SOLANA_0)
    expect(named.code).toBe(1)
    expect(named.output).toContain("Network 'ethereum' is disabled.")
    expect(named.output).toContain(`wdk module enable --name ${EVM_MODULE}`)
  })
})

describe('message verify', () => {
  it('accepts a signature over the message that was signed', async () => {
    await importAndUnlock()

    const result = await cli.json(
      ['message', 'verify', '--network', 'ethereum', '--message', 'hello',
        '--signature', HELLO_SIGNATURE_0],
      { unlocked: true }
    )

    expect(result).toEqual({
      network: 'ethereum',
      index: 0,
      message: 'hello',
      signature: HELLO_SIGNATURE_0,
      address: ETHEREUM_0,
      valid: true
    })
  })

  it('checks against the account at the index it is given', async () => {
    await importAndUnlock()

    const atOne = await cli.json(
      ['message', 'verify', '--network', 'ethereum', '--message', 'hello',
        '--signature', HELLO_SIGNATURE_1, '--index', '1'],
      { unlocked: true }
    )
    const atZero = await cli.json(
      ['message', 'verify', '--network', 'ethereum', '--message', 'hello',
        '--signature', HELLO_SIGNATURE_1],
      { unlocked: true }
    )

    expect(atOne).toMatchObject({ index: 1, address: ETHEREUM_1, valid: true })
    expect(atZero).toMatchObject({ index: 0, address: ETHEREUM_0, valid: false })
  })

  it('rejects the same signature over a different message', async () => {
    await importAndUnlock()

    const result = await cli.json(
      ['message', 'verify', '--network', 'ethereum', '--message', 'tampered',
        '--signature', HELLO_SIGNATURE_0],
      { unlocked: true }
    )

    expect(result).toMatchObject({ message: 'tampered', address: ETHEREUM_0, valid: false })
  })

  it('reports a signature that is not well formed', async () => {
    await importAndUnlock()

    const result = await cli.run(
      ['message', 'verify', '--network', 'ethereum', '--message', 'hello', '--signature', '0xdead'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain('invalid raw signature length')
  })

  it('refuses an empty signature before reaching the wallet', async () => {
    await importAndUnlock()

    const result = await cli.run(
      ['message', 'verify', '--network', 'ethereum', '--message', 'hello', '--signature', ''],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain('Signature must be a non-empty string.')
  })
})
