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

import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'

const state = {
  list: async () => [],
  unlock: async () => 'seed',
  getDefaultWallet: () => '',
  promptPassphrase: async () => '',
  promptArgs: [],
  unlockArgs: [],
}

mock.module('../../../src/services/key-service.js', {
  namedExports: {
    KeyService: class {
      list(...args) { return state.list(...args) }
      unlock(...args) { state.unlockArgs.push(args); return state.unlock(...args) }
    },
  },
})

mock.module('../../../src/security/keyring.js', {
  namedExports: { WalletKeyring: class {} },
})

mock.module('../../../src/services/config-service.js', {
  namedExports: {
    configService: {
      getDefaultWallet: (...args) => state.getDefaultWallet(...args),
    },
  },
})

mock.module('../../../src/ui/prompts.js', {
  namedExports: {
    promptPassphrase: async (...args) => {
      state.promptArgs.push(args)
      return state.promptPassphrase(...args)
    },
  },
})

const { requirePassphraseConfirmation } = await import('../../../src/ui/auth.js')

describe('requirePassphraseConfirmation', () => {
  beforeEach(() => {
    state.list = async () => []
    state.unlock = async () => 'seed'
    state.getDefaultWallet = () => ''
    state.promptPassphrase = async () => ''
    state.promptArgs = []
    state.unlockArgs = []
  })

  it('returns silently when no wallets exist', async () => {
    state.list = async () => []
    state.getDefaultWallet = () => ''

    const result = await requirePassphraseConfirmation()
    assert.equal(result, undefined)
    assert.equal(state.promptArgs.length, 0)
    assert.equal(state.unlockArgs.length, 0)
  })

  it('prompts and unlocks the default wallet when it exists', async () => {
    state.list = async () => ['wallet-a', 'wallet-b']
    state.getDefaultWallet = () => 'wallet-b'
    state.promptPassphrase = async () => 'pass-b'
    state.unlock = async () => 'seed-b'

    await requirePassphraseConfirmation()

    assert.equal(state.promptArgs.length, 1)
    assert.ok(state.promptArgs[0][0].includes("'wallet-b'"))
    assert.deepEqual(state.unlockArgs[0], ['pass-b', 'wallet-b'])
  })

  it('throws when wallets exist but defaultWallet is empty', async () => {
    state.list = async () => ['wallet-a', 'wallet-b']
    state.getDefaultWallet = () => ''

    await assert.rejects(requirePassphraseConfirmation(), /No default wallet is set/)
    assert.equal(state.promptArgs.length, 0)
    assert.equal(state.unlockArgs.length, 0)
  })

  it('throws when defaultWallet is stale', async () => {
    state.list = async () => ['wallet-a']
    state.getDefaultWallet = () => 'ghost-wallet'

    await assert.rejects(requirePassphraseConfirmation(), /Default wallet 'ghost-wallet' no longer exists/)
    assert.equal(state.promptArgs.length, 0)
    assert.equal(state.unlockArgs.length, 0)
  })

  it('propagates unlock failure on wrong passphrase', async () => {
    state.list = async () => ['wallet-a']
    state.getDefaultWallet = () => 'wallet-a'
    state.promptPassphrase = async () => 'wrong-pass'
    state.unlock = async () => { throw new Error('Incorrect passphrase.') }

    await assert.rejects(requirePassphraseConfirmation(), /Incorrect passphrase/)
  })
})
