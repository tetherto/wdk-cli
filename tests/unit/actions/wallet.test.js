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

const daemonListWallets = jest.fn()

jest.unstable_mockModule('../../../src/daemon/client.js', () => ({
  daemonClient: { listWallets: daemonListWallets }
}))

jest.unstable_mockModule('../../../src/services/key-service.js', () => ({
  KeyService: class {
    list = async () => ['main', 'savings']
  }
}))

jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: { getDefaultWallet: () => 'main' }
}))

const { listWallets } = await import('../../../src/actions/wallet.js')

describe('listWallets', () => {
  it('adds session times to the unlocked wallets only', async () => {
    daemonListWallets.mockResolvedValue([{ name: 'savings', ttlMs: 300000, ttlRemaining: 120000 }])

    expect(await listWallets()).toEqual({
      wallets: [
        { name: 'main', default: true, unlocked: false },
        { name: 'savings', default: false, unlocked: true, ttlMs: 300000, ttlRemaining: 120000 }
      ],
      count: 2
    })
  })

  it('reports every wallet as locked when the daemon cannot be reached', async () => {
    daemonListWallets.mockRejectedValue(new Error('Wallet is locked.'))

    expect(await listWallets()).toEqual({
      wallets: [
        { name: 'main', default: true, unlocked: false },
        { name: 'savings', default: false, unlocked: false }
      ],
      count: 2
    })
  })
})
