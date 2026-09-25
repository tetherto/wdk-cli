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
const assertIndexerAvailable = jest.fn()

jest.unstable_mockModule('../../../src/daemon/client.js', () => ({
  daemonClient: { requireUnlocked }
}))

const indexerService = await import('../../../src/services/indexer-service.js')
jest.unstable_mockModule('../../../src/services/indexer-service.js', () => ({
  ...indexerService,
  assertIndexerAvailable
}))

const { getHistory } = await import('../../../src/actions/history.js')

const NO_INDEXER = new WdkCliError('No indexer is available.', ErrorCode.MISSING_CONFIG)

beforeEach(() => {
  requireUnlocked.mockReset()
  assertIndexerAvailable.mockReset()
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
})
