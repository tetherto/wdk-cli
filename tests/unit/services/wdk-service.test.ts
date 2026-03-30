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

import { describe, it, expect } from 'vitest'
import { CONFIG_DEFAULTS } from '../../../src/config/constants.js'

describe('network config from wdk-config.json', () => {
  const networks = CONFIG_DEFAULTS.networks as Record<string, Record<string, unknown>>

  it('bitcoin config uses SDK field names directly', () => {
    expect(networks.bitcoin.host).toBe('electrum.blockstream.info')
    expect(networks.bitcoin.port).toBe(50001)
    expect(networks.bitcoin.network).toBe('bitcoin')
    expect(networks.bitcoin.bip).toBe(84)
  })

  it('ethereum config uses provider field', () => {
    expect(networks.ethereum.provider).toBe('https://ethereum-rpc.publicnode.com')
    expect(networks.ethereum.transferMaxFee).toBe(5000000000000000)
  })

  it('solana config uses rpcUrl (not provider)', () => {
    expect(networks.solana.rpcUrl).toBe('https://api.mainnet-beta.solana.com')
    expect(networks.solana).not.toHaveProperty('provider')
  })

  it('spark config uses network (not sparkNetwork)', () => {
    expect(networks.spark.network).toBe('MAINNET')
    expect(networks.spark).not.toHaveProperty('sparkNetwork')
  })

  it('smart account config has paymasterToken as object', () => {
    const sa = networks['smart-account-ethereum']
    expect(sa.paymasterToken).toEqual({ address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' })
  })

  it('smart account config has no mode field', () => {
    const sa = networks['smart-account-ethereum']
    expect(sa).not.toHaveProperty('mode')
  })

  it('smart account config passes through all fields', () => {
    const sa = networks['smart-account-ethereum']
    expect(sa.chainId).toBe(1)
    expect(sa.provider).toBeTruthy()
    expect(sa.bundlerUrl).toBeTruthy()
    expect(sa.entryPointAddress).toBeTruthy()
    expect(sa.safeModulesVersion).toBe('0.3.0')
    expect(sa.paymasterUrl).toBeTruthy()
    expect(sa.paymasterAddress).toBeTruthy()
  })

  it('tron config has provider and transferMaxFee', () => {
    expect(networks.tron.provider).toBe('https://api.trongrid.io')
    expect(networks.tron.transferMaxFee).toBe(30000000)
  })

  it('no network config has empty string values', () => {
    for (const [name, config] of Object.entries(networks)) {
      for (const [key, value] of Object.entries(config)) {
        expect(value, `${name}.${key} should not be empty string`).not.toBe('')
      }
    }
  })
})
