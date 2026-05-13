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

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  unlock: vi.fn(),
  getDefaultWallet: vi.fn(),
  promptPassphrase: vi.fn(),
}))

vi.mock('../../../src/services/key-service.js', () => ({
  KeyService: vi.fn().mockImplementation(() => ({
    list: mocks.list,
    unlock: mocks.unlock,
  })),
}))

vi.mock('../../../src/security/keyring.js', () => ({
  WalletKeyring: vi.fn(),
}))

vi.mock('../../../src/services/config-service.js', () => ({
  configService: {
    getDefaultWallet: mocks.getDefaultWallet,
  },
}))

vi.mock('../../../src/ui/prompts.js', () => ({
  promptPassphrase: mocks.promptPassphrase,
}))

import { requirePassphraseConfirmation } from '../../../src/ui/auth.js'

describe('requirePassphraseConfirmation', () => {
  beforeEach(() => {
    mocks.list.mockReset()
    mocks.unlock.mockReset()
    mocks.getDefaultWallet.mockReset()
    mocks.promptPassphrase.mockReset()
  })

  it('returns silently when no wallets exist', async () => {
    mocks.list.mockResolvedValueOnce([])
    mocks.getDefaultWallet.mockReturnValue('')

    await expect(requirePassphraseConfirmation()).resolves.toBeUndefined()
    expect(mocks.promptPassphrase).not.toHaveBeenCalled()
    expect(mocks.unlock).not.toHaveBeenCalled()
  })

  it('prompts and unlocks the default wallet when it exists', async () => {
    mocks.list.mockResolvedValueOnce(['wallet-a', 'wallet-b'])
    mocks.getDefaultWallet.mockReturnValue('wallet-b')
    mocks.promptPassphrase.mockResolvedValueOnce('pass-b')
    mocks.unlock.mockResolvedValueOnce('seed-b')

    await requirePassphraseConfirmation()

    expect(mocks.promptPassphrase).toHaveBeenCalledOnce()
    expect(mocks.promptPassphrase.mock.calls[0][0]).toContain("'wallet-b'")
    expect(mocks.unlock).toHaveBeenCalledWith('pass-b', 'wallet-b')
  })

  it('throws when wallets exist but defaultWallet is empty', async () => {
    mocks.list.mockResolvedValueOnce(['wallet-a', 'wallet-b'])
    mocks.getDefaultWallet.mockReturnValue('')

    await expect(requirePassphraseConfirmation()).rejects.toThrow(/No default wallet is set/)
    expect(mocks.promptPassphrase).not.toHaveBeenCalled()
    expect(mocks.unlock).not.toHaveBeenCalled()
  })

  it('throws when defaultWallet is stale', async () => {
    mocks.list.mockResolvedValueOnce(['wallet-a'])
    mocks.getDefaultWallet.mockReturnValue('ghost-wallet')

    await expect(requirePassphraseConfirmation()).rejects.toThrow(/Default wallet 'ghost-wallet' no longer exists/)
    expect(mocks.promptPassphrase).not.toHaveBeenCalled()
    expect(mocks.unlock).not.toHaveBeenCalled()
  })

  it('propagates unlock failure on wrong passphrase', async () => {
    mocks.list.mockResolvedValueOnce(['wallet-a'])
    mocks.getDefaultWallet.mockReturnValue('wallet-a')
    mocks.promptPassphrase.mockResolvedValueOnce('wrong-pass')
    mocks.unlock.mockRejectedValueOnce(new Error('Incorrect passphrase.'))

    await expect(requirePassphraseConfirmation()).rejects.toThrow('Incorrect passphrase')
  })
})
