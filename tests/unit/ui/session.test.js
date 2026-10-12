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

jest.unstable_mockModule('../../../src/daemon/client.js', () => ({
  daemonClient: { isRunning, lock }
}))

const { lockWalletsAfterChange } = await import('../../../src/ui/session.js')

const LOCK_NOTE = 'All wallets have been locked so the change takes effect. Run `wdk wallet unlock` to continue.'
const PENDING_NOTE = 'The change takes effect at the next `wdk wallet unlock`.'

let logged

beforeEach(() => {
  isRunning.mockReset()
  lock.mockReset()
  logged = []
  jest.spyOn(console, 'log').mockImplementation((line) => logged.push(String(line)))
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('lockWalletsAfterChange', () => {
  it('locks a running daemon and warns', async () => {
    isRunning.mockResolvedValue(true)

    expect(await lockWalletsAfterChange(false)).toBe(true)
    expect(lock).toHaveBeenCalled()
    expect(logged).toEqual([LOCK_NOTE])
  })

  it('leaves a stopped daemon alone and says when the change applies', async () => {
    isRunning.mockResolvedValue(false)

    expect(await lockWalletsAfterChange(false)).toBe(false)
    expect(lock).not.toHaveBeenCalled()
    expect(logged).toEqual([PENDING_NOTE])
  })

  it('prints nothing in JSON mode, in either state', async () => {
    isRunning.mockResolvedValue(true)
    expect(await lockWalletsAfterChange(true)).toBe(true)

    isRunning.mockResolvedValue(false)
    expect(await lockWalletsAfterChange(true)).toBe(false)

    expect(logged).toEqual([])
  })
})
