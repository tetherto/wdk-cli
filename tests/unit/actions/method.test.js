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
const daemonCallMethod = jest.fn()

jest.unstable_mockModule('../../../src/daemon/client.js', () => ({
  daemonClient: { requireUnlocked, callMethod: daemonCallMethod }
}))

const { listMethods, listAllMethods, callMethod } = await import('../../../src/actions/method.js')
const { configService } = await import('../../../src/services/config-service.js')

beforeEach(() => {
  requireUnlocked.mockReset()
  daemonCallMethod.mockReset()
})

describe('listMethods', () => {
  it('returns the methods declared by the network module', () => {
    const result = listMethods({ network: 'ethereum' })

    expect(result).toEqual({
      network: 'ethereum',
      methods: [
        { name: 'getAllowance', kind: 'read', params: { token: 'string', spender: 'string' } },
        { name: 'getTokenBalances', kind: 'read', params: { tokenAddresses: 'string[]' } },
        { name: 'approve', kind: 'write', params: { token: 'string', spender: 'string', amount: 'bigint' } }
      ]
    })
  })

  it('returns an empty list for a module without declared methods', () => {
    const result = listMethods({ network: 'bitcoin' })

    expect(result).toEqual({ network: 'bitcoin', methods: [] })
  })

  it('rejects an unknown network', () => {
    expect(() => listMethods({ network: 'nope' })).toThrow("Network 'nope' is not supported.")
  })
})

describe('listAllMethods', () => {
  it('returns every module that declares methods', () => {
    const result = listAllMethods()

    expect(result.modules.map((m) => m.module)).toEqual([
      '@tetherto/wdk-wallet-evm',
      '@tetherto/wdk-wallet-evm-erc-4337',
      '@tetherto/wdk-wallet-spark'
    ])
    const spark = result.modules.find((m) => m.module === '@tetherto/wdk-wallet-spark')
    expect(spark.methods).toContainEqual({
      name: 'claimStaticDeposit',
      kind: 'write',
      params: { txid: 'string' }
    })
  })

  it('leaves out a disabled module', () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'overrides' ? { modules: { '@tetherto/wdk-wallet-spark': { enabled: false } } } : undefined
    )

    const result = listAllMethods()

    expect(result.modules.map((m) => m.module)).toEqual([
      '@tetherto/wdk-wallet-evm',
      '@tetherto/wdk-wallet-evm-erc-4337'
    ])
    jest.restoreAllMocks()
  })
})

describe('callMethod', () => {
  const DUMMY_ADDRESS = 'sprt1dummyaddress0000000000000000000000000000000000000000000000'

  it('dispatches a valid call through the daemon client', async () => {
    requireUnlocked.mockResolvedValue('dummy-wallet')
    daemonCallMethod.mockResolvedValue({ result: { transferId: 'dummy-transfer-id' }, address: DUMMY_ADDRESS })

    const result = await callMethod({
      network: 'spark-regtest',
      name: 'claimStaticDeposit',
      args: { txid: 'dummy-txid' },
      index: 0
    })

    expect(requireUnlocked).toHaveBeenCalledWith(undefined)
    expect(daemonCallMethod).toHaveBeenCalledWith(
      'spark-regtest',
      'claimStaticDeposit',
      { txid: 'dummy-txid' },
      0,
      'dummy-wallet'
    )
    expect(result).toEqual({
      network: 'spark-regtest',
      method: 'claimStaticDeposit',
      address: DUMMY_ADDRESS,
      result: { transferId: 'dummy-transfer-id' }
    })
  })

  it('rejects an unknown method without touching the daemon', async () => {
    await expect(
      callMethod({ network: 'spark-regtest', name: 'nope', args: {}, index: 0 })
    ).rejects.toThrow("Unknown method 'nope' for network 'spark-regtest'.")

    expect(requireUnlocked).not.toHaveBeenCalled()
    expect(daemonCallMethod).not.toHaveBeenCalled()
  })

  it('rejects a missing required parameter without touching the daemon', async () => {
    await expect(
      callMethod({ network: 'spark-regtest', name: 'claimStaticDeposit', args: {}, index: 0 })
    ).rejects.toThrow('Missing required parameter --txid.')

    expect(daemonCallMethod).not.toHaveBeenCalled()
  })
})
