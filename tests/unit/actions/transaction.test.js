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

const requireUnlocked = jest.fn()
const daemonGetTransaction = jest.fn()

jest.unstable_mockModule('../../../src/daemon/client.js', () => ({
  daemonClient: {
    requireUnlocked,
    getTransaction: daemonGetTransaction
  }
}))

await import('../../../src/services/install-node-host.js')
const { getTransaction, FINALITY_TARGETS } = await import('../../../src/actions/transaction.js')

const HASH = '0x9e2c084b21f5b6a3f2d1c74e6a9d7b8f5a4c3e2d1b0a99887766554433221100'

beforeEach(() => {
  requireUnlocked.mockReset()
  daemonGetTransaction.mockReset()
})

describe('FINALITY_TARGETS', () => {
  it('exposes the two supported wait targets', () => {
    expect(FINALITY_TARGETS).toEqual(['confirmed', 'final'])
  })
})

describe('getTransaction', () => {
  it('returns the normalized receipt for the current state', async () => {
    requireUnlocked.mockResolvedValue('main')
    const DUMMY_RECEIPT = { hash: HASH, finality: 'confirmed', success: true, block: 5, fee: '21000' }
    daemonGetTransaction.mockResolvedValue(DUMMY_RECEIPT)

    const result = await getTransaction({ network: 'ethereum', hash: HASH, index: 0 })

    expect(result).toEqual({
      network: 'ethereum',
      hash: HASH,
      index: 0,
      transaction: DUMMY_RECEIPT
    })
    expect(daemonGetTransaction).toHaveBeenCalledWith(
      'ethereum',
      HASH,
      { finality: undefined, timeout: undefined, index: 0 },
      'main'
    )
  })

  it('passes the finality target and timeout through to the daemon', async () => {
    requireUnlocked.mockResolvedValue('main')
    const DUMMY_RECEIPT = { hash: HASH, finality: 'final' }
    daemonGetTransaction.mockResolvedValue(DUMMY_RECEIPT)

    const result = await getTransaction({
      network: 'ethereum',
      hash: HASH,
      finality: 'final',
      timeout: 5000,
      index: 1
    })

    expect(result).toEqual({
      network: 'ethereum',
      hash: HASH,
      index: 1,
      transaction: DUMMY_RECEIPT
    })
    expect(daemonGetTransaction).toHaveBeenCalledWith(
      'ethereum',
      HASH,
      { finality: 'final', timeout: 5000, index: 1 },
      'main'
    )
  })

  it('rejects a timeout without a finality target', async () => {
    requireUnlocked.mockResolvedValue('main')

    await expect(
      getTransaction({ network: 'ethereum', hash: HASH, timeout: 5000, index: 0 })
    ).rejects.toThrow('A timeout requires a finality target.')
    expect(daemonGetTransaction).not.toHaveBeenCalled()
  })

  it('rejects an invalid finality target', async () => {
    requireUnlocked.mockResolvedValue('main')

    await expect(
      getTransaction({ network: 'ethereum', hash: HASH, finality: 'sooner', index: 0 })
    ).rejects.toThrow("Invalid finality target 'sooner'.")
    expect(daemonGetTransaction).not.toHaveBeenCalled()
  })

  it('rejects an empty hash', async () => {
    requireUnlocked.mockResolvedValue('main')

    await expect(getTransaction({ network: 'ethereum', hash: '', index: 0 })).rejects.toThrow(
      'Transaction hash must be a non-empty string.'
    )
    expect(daemonGetTransaction).not.toHaveBeenCalled()
  })

  it('rejects an unknown network', async () => {
    requireUnlocked.mockResolvedValue('main')

    await expect(getTransaction({ network: 'nope', hash: HASH, index: 0 })).rejects.toThrow(
      "Network 'nope' is not supported."
    )
  })
})
