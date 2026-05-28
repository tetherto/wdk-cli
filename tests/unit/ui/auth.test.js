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

const state = {
  list: async () => [],
  unlock: async () => 'seed',
  getDefaultWallet: () => '',
  promptPassphrase: async () => '',
  promptArgs: [],
  unlockArgs: []
}

jest.unstable_mockModule('../../../src/services/key-service.js', () => ({
  KeyService: class {
    list (...args) {
      return state.list(...args)
    }

    unlock (...args) {
      state.unlockArgs.push(args)
      return state.unlock(...args)
    }
  }
}))

jest.unstable_mockModule('../../../src/security/keyring.js', () => ({
  WalletKeyring: class {}
}))

jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: {
    getDefaultWallet: (...args) => state.getDefaultWallet(...args)
  }
}))

jest.unstable_mockModule('../../../src/ui/prompts.js', () => ({
  promptPassphrase: async (...args) => {
    state.promptArgs.push(args)
    return state.promptPassphrase(...args)
  }
}))

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
    expect(result).toBeUndefined()
    expect(state.promptArgs.length).toBe(0)
    expect(state.unlockArgs.length).toBe(0)
  })

  it('prompts and unlocks the default wallet when it exists', async () => {
    state.list = async () => ['wallet-a', 'wallet-b']
    state.getDefaultWallet = () => 'wallet-b'
    state.promptPassphrase = async () => 'pass-b'
    state.unlock = async () => 'seed-b'

    await requirePassphraseConfirmation()

    expect(state.promptArgs.length).toBe(1)
    expect(state.promptArgs[0][0]).toContain("'wallet-b'")
    expect(state.unlockArgs[0]).toEqual(['pass-b', 'wallet-b'])
  })

  it('throws when wallets exist but defaultWallet is empty', async () => {
    state.list = async () => ['wallet-a', 'wallet-b']
    state.getDefaultWallet = () => ''

    await expect(requirePassphraseConfirmation()).rejects.toThrow(/No default wallet is set/)
    expect(state.promptArgs.length).toBe(0)
    expect(state.unlockArgs.length).toBe(0)
  })

  it('throws when defaultWallet is stale', async () => {
    state.list = async () => ['wallet-a']
    state.getDefaultWallet = () => 'ghost-wallet'

    await expect(requirePassphraseConfirmation()).rejects.toThrow(
      /Default wallet 'ghost-wallet' no longer exists/
    )
    expect(state.promptArgs.length).toBe(0)
    expect(state.unlockArgs.length).toBe(0)
  })

  it('propagates unlock failure on wrong passphrase', async () => {
    state.list = async () => ['wallet-a']
    state.getDefaultWallet = () => 'wallet-a'
    state.promptPassphrase = async () => 'wrong-pass'
    state.unlock = async () => {
      throw new Error('Incorrect passphrase.')
    }

    await expect(requirePassphraseConfirmation()).rejects.toThrow(/Incorrect passphrase/)
  })
})
