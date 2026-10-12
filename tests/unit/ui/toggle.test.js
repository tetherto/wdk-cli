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

const isRunning = jest.fn()
const lock = jest.fn()
const requirePassphraseConfirmation = jest.fn()

jest.unstable_mockModule('../../../src/daemon/client.js', () => ({
  daemonClient: { isRunning, lock }
}))

jest.unstable_mockModule('../../../src/ui/auth.js', () => ({ requirePassphraseConfirmation }))

const { applyToggle } = await import('../../../src/ui/toggle.js')

const PROGRAM_TEXT = { opts: () => ({ json: false }) }
const PROGRAM_JSON = { opts: () => ({ json: true }) }
const LOCK_NOTE = 'All wallets have been locked so the change takes effect. Run `wdk wallet unlock` to continue.'
const PENDING_NOTE = 'The change takes effect at the next `wdk wallet unlock`.'

let logged

beforeEach(() => {
  isRunning.mockReset()
  lock.mockReset()
  requirePassphraseConfirmation.mockReset()
  requirePassphraseConfirmation.mockResolvedValue(undefined)
  isRunning.mockResolvedValue(false)
  logged = []
  jest.spyOn(console, 'log').mockImplementation((line) => logged.push(String(line)))
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('applyToggle', () => {
  it('reports the entry as disabled and leaves a stopped daemon alone', async () => {
    await applyToggle(PROGRAM_TEXT, {
      apply: () => false,
      enabled: false,
      label: "Network 'tron'",
      result: { network: 'tron' }
    })

    expect(logged).toEqual(["Network 'tron' disabled.", PENDING_NOTE])
    expect(lock).not.toHaveBeenCalled()
    expect(requirePassphraseConfirmation).toHaveBeenCalled()
  })

  it('refuses to write when the passphrase is not confirmed', async () => {
    requirePassphraseConfirmation.mockRejectedValue(new Error('Wrong passphrase.'))
    const apply = jest.fn()

    await expect(applyToggle(PROGRAM_TEXT, {
      apply,
      enabled: false,
      label: "Network 'tron'",
      result: { network: 'tron' }
    })).rejects.toThrow('Wrong passphrase.')

    expect(apply).not.toHaveBeenCalled()
    expect(lock).not.toHaveBeenCalled()
  })

  it('locks a running daemon and says so', async () => {
    isRunning.mockResolvedValue(true)

    await applyToggle(PROGRAM_TEXT, {
      apply: () => false,
      enabled: true,
      label: "Network 'tron'",
      result: { network: 'tron' }
    })

    expect(lock).toHaveBeenCalled()
    expect(logged).toEqual(["Network 'tron' enabled.", LOCK_NOTE])
  })

  it('lower-cases the label when it cleared a stale override', async () => {
    await applyToggle(PROGRAM_TEXT, {
      apply: () => true,
      enabled: true,
      label: "Module '@gone/pkg'",
      result: { module: '@gone/pkg' }
    })

    expect(logged).toEqual(["Stale override for module '@gone/pkg' removed.", PENDING_NOTE])
  })

  it('reports walletsLocked: false when no wallet was unlocked', async () => {
    await applyToggle(PROGRAM_JSON, {
      apply: () => false,
      enabled: true,
      label: "Network 'tron'",
      result: { network: 'tron' }
    })

    expect(logged).toEqual([
      JSON.stringify({ network: 'tron', enabled: true, stale: false, walletsLocked: false })
    ])
  })

  it('prints a single JSON line and no lock note', async () => {
    isRunning.mockResolvedValue(true)

    await applyToggle(PROGRAM_JSON, {
      apply: () => false,
      enabled: false,
      label: "Token 'ethereum/usdt'",
      result: { network: 'ethereum', token: 'usdt' }
    })

    expect(logged).toEqual([
      JSON.stringify({ network: 'ethereum', token: 'usdt', enabled: false, stale: false, walletsLocked: true })
    ])
  })
})
