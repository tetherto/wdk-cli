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
import { encrypt } from '@tetherto/wdk-utils'

const PASSPHRASE = 'correct-horse-battery-staple'
const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const SEED_FILE = JSON.stringify(encrypt(SEED, PASSPHRASE))

const createInstance = jest.fn()
const dispose = jest.fn()

jest.unstable_mockModule('../../../../src/services/config-service.js', () => ({
  configService: { get: () => undefined, getDefaultWallet: () => '' }
}))

jest.unstable_mockModule('../../../../src/services/wdk-service.js', () => ({
  WdkService: class {
    createInstance (seed) { createInstance(seed) }
    dispose () { dispose() }
  }
}))

const { WalletDaemonCore } = await import('../../../../src/daemon/core/wallet-daemon-core.js')

/**
 * Builds a core over an in-memory wallet store holding one wallet, `main`.
 *
 * @returns {{ core: InstanceType<typeof WalletDaemonCore>, readSeedFile: jest.Mock, requestShutdown: jest.Mock }} The core and its host doubles.
 */
function createCore () {
  const readSeedFile = jest.fn(async (name) => {
    if (name !== 'main') throw Object.assign(new Error(`no wallet ${name}`), { code: 'ENOENT' })
    return SEED_FILE
  })
  const requestShutdown = jest.fn()
  const core = new WalletDaemonCore({ walletStore: { readSeedFile }, pid: 4242, requestShutdown })
  return { core, readSeedFile, requestShutdown }
}

beforeEach(() => {
  createInstance.mockReset()
  dispose.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('WalletDaemonCore', () => {
  it('opens a session from the seed file the wallet store returns', async () => {
    const { core, readSeedFile } = createCore()

    const unlock = await core.handleRequest({ action: 'unlock_wallet', wallet: 'main', passphrase: PASSPHRASE, ttl: 5 })
    const status = await core.handleRequest({ action: 'status' })

    expect(unlock).toEqual({ ok: true, data: { message: "Wallet 'main' unlocked", wallet: 'main' } })
    expect(readSeedFile).toHaveBeenCalledWith('main')
    expect(createInstance).toHaveBeenCalledTimes(1)
    expect(status).toEqual({
      ok: true,
      data: { unlocked: true, wallets: [{ name: 'main', ttlMs: 300000, ttlRemaining: expect.any(Number) }], pid: 4242 }
    })
    core.dispose()
  })

  it('refuses the wrong passphrase', async () => {
    const { core } = createCore()

    const response = await core.handleRequest({ action: 'unlock_wallet', wallet: 'main', passphrase: 'wrong', ttl: 5 })

    expect(response).toEqual({ ok: false, error: 'Incorrect passphrase.', code: 'WRONG_PASSPHRASE' })
    expect(createInstance).not.toHaveBeenCalled()
  })

  it('refuses an invalid wallet name without asking the wallet store', async () => {
    const { core, readSeedFile } = createCore()

    const response = await core.handleRequest({ action: 'unlock_wallet', wallet: '../main', passphrase: PASSPHRASE, ttl: 5 })

    expect(response).toEqual({
      ok: false,
      error: "Invalid wallet name: '../main'.",
      code: 'INVALID_ARGUMENT',
      suggestion: 'Use only letters, numbers, hyphens, and underscores.'
    })
    expect(readSeedFile).not.toHaveBeenCalled()
  })

  it('passes on the wallet store error for a wallet that does not exist', async () => {
    const { core } = createCore()

    const response = await core.handleRequest({ action: 'unlock_wallet', wallet: 'other', passphrase: PASSPHRASE, ttl: 5 })

    expect(response).toEqual({ ok: false, error: 'no wallet other', code: 'ENOENT' })
  })

  it('creates a single session when one wallet is unlocked twice at once', async () => {
    const { core } = createCore()
    const request = { action: 'unlock_wallet', wallet: 'main', passphrase: PASSPHRASE, ttl: 5 }

    const responses = await Promise.all([core.handleRequest(request), core.handleRequest(request)])

    expect(responses.map((r) => r.ok)).toEqual([true, true])
    expect(createInstance).toHaveBeenCalledTimes(1)
    core.dispose()
  })

  it('asks the host to shut down when the last wallet is locked', async () => {
    const { core, requestShutdown } = createCore()
    await core.handleRequest({ action: 'unlock_wallet', wallet: 'main', passphrase: PASSPHRASE, ttl: 5 })

    const response = await core.handleRequest({ action: 'lock_wallet', wallet: 'main' })

    expect(response).toEqual({ ok: true, data: { message: "Wallet 'main' locked", wallet: 'main' } })
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(requestShutdown).toHaveBeenCalledTimes(1)
  })

  it('asks the host to shut down when the session expires', async () => {
    jest.useFakeTimers()
    const { core, requestShutdown } = createCore()
    await core.handleRequest({ action: 'unlock_wallet', wallet: 'main', passphrase: PASSPHRASE, ttl: 1 })

    jest.advanceTimersByTime(60 * 1000)

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(requestShutdown).toHaveBeenCalledTimes(1)
  })

  it('asks the host to shut down after answering a lock-all request', async () => {
    jest.useFakeTimers()
    const { core, requestShutdown } = createCore()

    const response = await core.handleRequest({ action: 'lock' })
    jest.advanceTimersByTime(100)

    expect(response).toEqual({ ok: true, data: { message: 'All wallets locked' } })
    expect(requestShutdown).toHaveBeenCalledTimes(1)
  })

  it('disposes every unlocked wallet on dispose without asking the host to shut down', async () => {
    const { core, requestShutdown } = createCore()
    await core.handleRequest({ action: 'unlock_wallet', wallet: 'main', passphrase: PASSPHRASE, ttl: 5 })

    core.dispose()
    const status = await core.handleRequest({ action: 'status' })

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(requestShutdown).not.toHaveBeenCalled()
    expect(status.data).toEqual({ unlocked: false, wallets: [], pid: 4242 })
  })
})
