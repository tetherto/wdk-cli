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
import { WdkCliError, ErrorCode } from '../../../src/errors/index.js'

const requireUnlocked = jest.fn()
const getAddress = jest.fn()
const assertIndexerAvailable = jest.fn()
const getTokenTransfers = jest.fn()

jest.unstable_mockModule('../../../src/daemon/client.js', () => ({
  daemonClient: { requireUnlocked, getAddress }
}))

const indexerService = await import('../../../src/services/indexer-service.js')
jest.unstable_mockModule('../../../src/services/indexer-service.js', () => ({
  ...indexerService,
  assertIndexerAvailable,
  getTokenTransfers
}))

const { getHistory } = await import('../../../src/actions/history.js')

const NO_INDEXER = new WdkCliError('No indexer is available.', ErrorCode.MISSING_CONFIG)

const ADDRESS = '0x28C6c06298d514Db089934071355E5743bf21d60'

beforeEach(() => {
  requireUnlocked.mockReset()
  getAddress.mockReset().mockResolvedValue(ADDRESS)
  assertIndexerAvailable.mockReset()
  getTokenTransfers.mockReset().mockResolvedValue([])
})

describe('getHistory', () => {
  it('reports the missing indexer without unlocking the wallet first', async () => {
    assertIndexerAvailable.mockImplementation(() => { throw NO_INDEXER })
    requireUnlocked.mockRejectedValue(new Error('should not be reached'))

    await expect(getHistory({ network: 'ethereum', index: 0 })).rejects.toThrow(
      'No indexer is available.'
    )
    expect(requireUnlocked).not.toHaveBeenCalled()
  })

  it('sends the date range to the indexer in milliseconds', async () => {
    await getHistory({
      network: 'ethereum',
      index: 0,
      token: 'usdt',
      fromDate: '2026-01-01',
      toDate: '2026-03-31'
    })

    expect(getTokenTransfers).toHaveBeenCalledWith('ethereum', 'usdt', ADDRESS, {
      limit: 30,
      fromTs: Date.UTC(2026, 0, 1),
      toTs: Date.UTC(2026, 2, 31)
    })
  })
})
