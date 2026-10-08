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

// Spending is the one thing these tests must never do, so every command here
// is driven into a state it refuses before it signs anything or opens a
// socket: a locked wallet, an amount the token cannot express, a provider that
// does not serve the kind. `message sign` is the exception — it signs locally.

import { Cli } from './helpers.js'

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const ADDRESS = '0x405005C7c4422390F4B334F64Cf20E0b767131d0'
const ADDRESS_INDEX_1 = '0xcC81e04BadA16DEf9e1AFB027B859bec42BE49dB'

// ECDSA over a fixed seed and message is deterministic, so these are exact
// values rather than shapes. If either changes, the derivation changed.
const HELLO_SIGNATURE =
  '0x05c005143100eff1f58be46b0a7fb7fe1a47f20d29d7c14e913dc9ae798e00ab' +
  '6e769cf61784923262ba5bda8f0f5140d661a9b3f14df4d17837dc06dea555ac1b'
const HELLO_SIGNATURE_INDEX_1 =
  '0xa55303f33be43846f0669a238c2fab3875a3751db963b2bcf813652ed965eacf' +
  '26309379766241b8cdae2675fa59cc5c2c97afab5ef0c83e8d70948cf37ce77f1c'

/** @type {Cli} */
let cli

beforeEach(async () => {
  cli = new Cli()
  await cli.run(['wallet', 'import', '--name', 'main', '--seed-stdin'], {
    unlocked: true,
    stdin: SEED + '\n'
  })
  await cli.run(['wallet', 'unlock', '--name', 'main'], { unlocked: true })
})

afterEach(async () => {
  await cli.run(['wallet', 'lock', '--all'], { unlocked: true })
  cli.cleanup()
})

describe('message sign', () => {
  it('produces the signature this seed always produces', async () => {
    const result = await cli.json(
      ['message', 'sign', '--network', 'ethereum', '--message', 'hello'], { unlocked: true }
    )

    expect(result).toEqual({
      network: 'ethereum',
      index: 0,
      address: ADDRESS,
      message: 'hello',
      signature: HELLO_SIGNATURE
    })
  })

  it('signs with the account at the index it was given', async () => {
    const result = await cli.json(
      ['message', 'sign', '--network', 'ethereum', '--message', 'hello', '--index', '1'],
      { unlocked: true }
    )

    expect(result).toEqual({
      network: 'ethereum',
      index: 1,
      address: ADDRESS_INDEX_1,
      message: 'hello',
      signature: HELLO_SIGNATURE_INDEX_1
    })
    expect(result.signature).not.toBe(HELLO_SIGNATURE)
  })

  it('refuses to sign while locked', async () => {
    await cli.run(['wallet', 'lock', '--all'], { unlocked: true })

    const result = await cli.run(['message', 'sign', '--network', 'ethereum', '--message', 'hi'])

    expect(result.code).toBe(1)
    expect(result.output).toContain("Wallet 'main' is not unlocked.")
  })
})

describe('send', () => {
  it('refuses an amount finer than the token can represent', async () => {
    const result = await cli.run(
      ['send', '--network', 'ethereum', '--token', 'usdt', '--to', ADDRESS, '--amount', '1.1234567'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain("usdt '1.1234567' has more precision than 6 decimals allow.")
  })

  it('refuses a fractional amount when it was told the amount is base units', async () => {
    const result = await cli.run(
      ['send', '--network', 'ethereum', '--to', ADDRESS, '--amount', '1.5', '--base-units'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain(
      "Amount '1.5' must be a non-negative integer when --base-units is set."
    )
  })

  // The amount is one wei, deliberately: if this gate ever regressed the test
  // would broadcast, and one wei from an empty account is the cheapest way to
  // find out.
  it('refuses to send while locked', async () => {
    await cli.run(['wallet', 'lock', '--all'], { unlocked: true })

    const result = await cli.run(
      ['send', '--network', 'ethereum', '--to', ADDRESS, '--amount', '1', '--base-units']
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain("Wallet 'main' is not unlocked.")
  })
})

describe('swap', () => {
  it('needs exactly one of --amount-in and --amount-out', async () => {
    const both = await cli.run(
      ['swap', '--network', 'ethereum', '--from-token', 'usdt', '--to-token', 'eth',
        '--amount-in', '1', '--amount-out', '1'],
      { unlocked: true }
    )
    const neither = await cli.run(
      ['swap', '--network', 'ethereum', '--from-token', 'usdt', '--to-token', 'eth'],
      { unlocked: true }
    )

    expect(both.code).toBe(1)
    expect(both.output).toContain('Cannot specify both --amount-in and --amount-out.')
    expect(neither.code).toBe(1)
    expect(neither.output).toContain('Must specify either --amount-in or --amount-out.')
  })
})

describe('bridge', () => {
  it('sends the user to `wdk send` when both ends are the same chain', async () => {
    const result = await cli.run(
      ['bridge', '--network', 'ethereum', '--token', 'usdt', '--to-network', 'ethereum',
        '--amount', '1'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain(
      'Source and destination network are the same; use `wdk send` for same-chain transfers.'
    )
  })
})

describe('buy and sell', () => {
  // Both packaged fiat providers ship enabled, so the default installation is
  // exactly the ambiguous one. Picking either silently would send the user to
  // a provider they did not choose.
  it('asks which fiat provider to use while several are enabled', async () => {
    const result = await cli.run(
      ['buy', '--network', 'ethereum', '--token', 'usdt', '--fiat-amount', '100'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain('Several fiat providers are available: moonpay, transak.')
    expect(result.output).toContain('Choose one with: --provider moonpay')
  })
})

describe('an operation with no provider for its kind', () => {
  it('fails buy and sell once every fiat provider is off', async () => {
    await cli.json(['provider', 'disable', '--name', 'moonpay'], { unlocked: true })
    await cli.json(['provider', 'disable', '--name', 'transak'], { unlocked: true })
    await cli.run(['wallet', 'unlock', '--name', 'main'], { unlocked: true })

    for (const command of ['buy', 'sell']) {
      const result = await cli.run(
        [command, '--network', 'ethereum', '--token', 'usdt', '--fiat-amount', '100'],
        { unlocked: true }
      )

      expect(result.code).toBe(1)
      expect(result.output).toContain('No fiat provider is available.')
    }
  })

  it('fails swap once nothing can swap', async () => {
    for (const name of ['velora', 'rhinofi', 'symbiosis']) {
      await cli.json(['provider', 'disable', '--name', name], { unlocked: true })
    }
    await cli.run(['wallet', 'unlock', '--name', 'main'], { unlocked: true })

    const result = await cli.run(
      ['swap', '--network', 'ethereum', '--from-token', 'usdt', '--to-token', 'eth', '--amount-in', '1'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain('No installed protocol can swap.')
  })

  it('fails bridge once nothing can bridge', async () => {
    for (const name of ['usdt0', 'rhinofi', 'symbiosis']) {
      await cli.json(['provider', 'disable', '--name', name], { unlocked: true })
    }
    await cli.run(['wallet', 'unlock', '--name', 'main'], { unlocked: true })

    const result = await cli.run(
      ['bridge', '--network', 'ethereum', '--token', 'eth', '--to-network', 'arbitrum', '--amount', '1'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain('No installed protocol can bridge.')
  })
})

describe('choosing the provider with --provider', () => {
  it('refuses a provider the user disabled', async () => {
    await cli.json(['provider', 'disable', '--name', 'transak'], { unlocked: true })
    await cli.run(['wallet', 'unlock', '--name', 'main'], { unlocked: true })

    const result = await cli.run(
      ['buy', '--network', 'ethereum', '--token', 'usdt', '--fiat-amount', '100',
        '--provider', 'transak'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain("Protocol 'transak' is disabled.")
  })

  it('refuses a provider registered for another kind', async () => {
    const result = await cli.run(
      ['buy', '--network', 'ethereum', '--token', 'usdt', '--fiat-amount', '100',
        '--provider', 'velora'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain("Provider 'velora' is not a fiat on/off-ramp.")
    expect(result.output).toContain('It is a swap provider.')
  })

  it('lists what is available when the name is unknown', async () => {
    const result = await cli.run(
      ['buy', '--network', 'ethereum', '--token', 'usdt', '--fiat-amount', '100',
        '--provider', 'nosuch'],
      { unlocked: true }
    )

    expect(result.code).toBe(1)
    expect(result.output).toContain("Unknown protocol 'nosuch'.")
    expect(result.output).toContain('moonpay')
  })
})
