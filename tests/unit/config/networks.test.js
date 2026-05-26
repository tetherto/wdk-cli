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

import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  NETWORKS,
  NETWORK_NAMES,
  isValidNetwork,
  isTestnet,
  getNetworkConfig,
  getAllNetworks,
  getAllNetworkNames,
  isCustomNetwork,
  isBuiltinNetwork,
  getCustomNetworks,
  saveCustomNetwork,
  deleteCustomNetwork,
} from '../../../src/config/networks.js'
import { configService } from '../../../src/services/config-service.js'

describe('networks', () => {
  it('validates network names', () => {
    assert.equal(isValidNetwork('ethereum'), true)
    assert.equal(isValidNetwork('bitcoin'), true)
    assert.equal(isValidNetwork('solana'), true)
    assert.equal(isValidNetwork('solana-devnet'), true)
    assert.equal(isValidNetwork('unknown-network'), false)
    assert.equal(isValidNetwork(''), false)
  })

  it('identifies testnets', () => {
    assert.equal(isTestnet('bitcoin-testnet3'), true)
    assert.equal(isTestnet('sepolia'), true)
    assert.equal(isTestnet('solana-testnet'), true)
    assert.equal(isTestnet('solana-devnet'), true)
    assert.equal(isTestnet('spark-regtest'), true)
    assert.equal(isTestnet('smart-account-sepolia'), true)
    assert.equal(isTestnet('bitcoin'), false)
    assert.equal(isTestnet('ethereum'), false)
    assert.equal(isTestnet('solana'), false)
    assert.equal(isTestnet('spark'), false)
    assert.equal(isTestnet('smart-account-ethereum'), false)
  })

  it('all built-in networks have required fields', () => {
    for (const network of NETWORK_NAMES) {
      const config = NETWORKS[network]
      assert.equal(config.name, network)
      assert.ok(config.displayName)
      assert.match(config.module, /^@tetherto\/wdk-wallet-(evm|btc|solana|spark|evm-erc-4337|tron)(@.+)?$/)
      assert.ok(config.nativeSymbol)
      assert.ok(config.decimals > 0)
    }
  })

  it('identifies built-in networks', () => {
    assert.equal(isBuiltinNetwork('ethereum'), true)
    assert.equal(isBuiltinNetwork('bitcoin'), true)
    assert.equal(isBuiltinNetwork('nonexistent'), false)
  })
})

describe('custom networks', () => {
  const mockCustomNetwork = {
    name: 'optimism',
    displayName: 'Optimism',
    type: '@tetherto/wdk-wallet-evm',
    module: '@tetherto/wdk-wallet-evm',
    nativeSymbol: 'ETH',
    decimals: 18,
    custom: true,
    testnet: false,
  }

  beforeEach(() => {
    mock.method(configService, 'get', (key) => {
      if (key === 'customNetworks') {
        return { optimism: mockCustomNetwork }
      }
      return undefined
    })
  })

  afterEach(() => {
    mock.restoreAll()
  })

  it('returns custom networks from config', () => {
    const custom = getCustomNetworks()
    assert.ok(Object.prototype.hasOwnProperty.call(custom, 'optimism'))
    assert.equal(custom.optimism.displayName, 'Optimism')
    assert.equal(custom.optimism.custom, true)
  })

  it('getAllNetworks merges built-in and custom', () => {
    const all = getAllNetworks()
    assert.ok(Object.prototype.hasOwnProperty.call(all, 'ethereum'))
    assert.ok(Object.prototype.hasOwnProperty.call(all, 'optimism'))
  })

  it('getAllNetworkNames includes custom networks', () => {
    const names = getAllNetworkNames()
    assert.ok(names.includes('ethereum'))
    assert.ok(names.includes('optimism'))
  })

  it('isValidNetwork accepts custom networks', () => {
    assert.equal(isValidNetwork('optimism'), true)
    assert.equal(isValidNetwork('nonexistent'), false)
  })

  it('isCustomNetwork identifies custom networks', () => {
    assert.equal(isCustomNetwork('optimism'), true)
    assert.equal(isCustomNetwork('ethereum'), false)
  })

  it('getNetworkConfig returns custom network config', () => {
    const config = getNetworkConfig('optimism')
    assert.equal(config.displayName, 'Optimism')
    assert.equal(config.module, '@tetherto/wdk-wallet-evm')
    assert.equal(config.custom, true)
  })

  it('isTestnet works with custom networks', () => {
    assert.equal(isTestnet('optimism'), false)

    mock.restoreAll()
    mock.method(configService, 'get', (key) => {
      if (key === 'customNetworks') {
        return { 'optimism-testnet': { ...mockCustomNetwork, name: 'optimism-testnet', testnet: true } }
      }
      return undefined
    })

    assert.equal(isTestnet('optimism-testnet'), true)
  })

  it('saveCustomNetwork stores to config', () => {
    const setMock = mock.method(configService, 'set', () => {})
    saveCustomNetwork('linea', mockCustomNetwork)
    assert.equal(setMock.mock.callCount(), 1)
    assert.deepEqual(setMock.mock.calls[0].arguments, ['customNetworks.linea', mockCustomNetwork])
  })

  it('deleteCustomNetwork removes from config', () => {
    const deleteMock = mock.method(configService, 'delete', () => {})
    deleteCustomNetwork('optimism')
    assert.equal(deleteMock.mock.callCount(), 1)
    assert.deepEqual(deleteMock.mock.calls[0].arguments, ['customNetworks.optimism'])
  })

  it('returns empty object when no custom networks exist', () => {
    mock.restoreAll()
    mock.method(configService, 'get', () => undefined)
    const custom = getCustomNetworks()
    assert.deepEqual(custom, {})
  })
})
