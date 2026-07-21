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
import { validateRecipient } from '../../../src/services/address-service.js'
import { configService } from '../../../src/services/config-service.js'
import { walletsFile } from '../../../src/config/wdk-config.js'
import { WdkCliError } from '../../../src/errors/index.js'

const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const BTC_MAINNET = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
const BTC_TESTNET = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'

describe('validateRecipient', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('accepts valid addresses for each network family', () => {
    const USDT_SOL = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
    const USDT_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    const SPARK_ADDRESS = 'spark1pgss82uvuvyjggx72gl42qk3285yz0j6lgxw9uk2mvgajsr8w22nudv8w6hqs2'

    expect(validateRecipient('ethereum', USDT_ETH)).toBeUndefined()
    expect(validateRecipient('bitcoin', BTC_MAINNET)).toBeUndefined()
    expect(validateRecipient('bitcoin-testnet3', BTC_TESTNET)).toBeUndefined()
    expect(validateRecipient('solana', USDT_SOL)).toBeUndefined()
    expect(validateRecipient('tron', USDT_TRON)).toBeUndefined()
    expect(validateRecipient('spark', SPARK_ADDRESS)).toBeUndefined()
  })

  it('rejects an invalid address with a WdkCliError carrying the validator reason', () => {
    let error
    try {
      validateRecipient('ethereum', 'not-an-address')
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(WdkCliError)
    expect(error.message).toBe("Invalid recipient address for 'ethereum' (INVALID_FORMAT).")
    expect(error.code).toBe('INVALID_ADDRESS')
    expect(error.suggestion).toBe('Double-check the address and the selected --network.')
  })

  it('rejects a testnet address on Bitcoin mainnet', () => {
    expect(() => validateRecipient('bitcoin', BTC_TESTNET)).toThrow(
      "Invalid recipient address for 'bitcoin' (NETWORK_MISMATCH: testnet address)."
    )
  })

  it('rejects a mainnet address on Bitcoin testnet', () => {
    expect(() => validateRecipient('bitcoin-testnet3', BTC_MAINNET)).toThrow(
      "Invalid recipient address for 'bitcoin-testnet3' (NETWORK_MISMATCH: mainnet address)."
    )
  })

  it('rejects garbage on every built-in network (validator coverage guard)', () => {
    for (const network of Object.keys(walletsFile.networks)) {
      expect(() => validateRecipient(network, '!!definitely-not-an-address!!')).toThrow(
        `Invalid recipient address for '${network}'`
      )
    }
  })

  it('validates custom networks that declare a chain id', () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'customNetworks.linea.chainId' ? 'eip155:59144' : undefined
    )

    expect(validateRecipient('linea', USDT_ETH)).toBeUndefined()
    expect(() => validateRecipient('linea', 'not-an-address')).toThrow(
      "Invalid recipient address for 'linea' (INVALID_FORMAT)."
    )
    expect(configService.get).toHaveBeenCalledWith('customNetworks.linea.chainId')
  })

  it('skips validation for networks without a chain id', () => {
    jest.spyOn(configService, 'get').mockImplementation(() => undefined)

    expect(validateRecipient('mynet', 'anything-goes-here')).toBeUndefined()
    expect(configService.get).toHaveBeenCalledWith('customNetworks.mynet.chainId')
  })

  it('rejects a mismatched address on a custom Bitcoin network', () => {
    jest.spyOn(configService, 'get').mockImplementation((key) => {
      if (key === 'customNetworks.mybtc.chainId') return 'bip122:000000000019d6689c085ae165831e93'
      if (key === 'customNetworks.mybtc.config.network') return 'testnet'
      return undefined
    })

    expect(() => validateRecipient('mybtc', BTC_MAINNET)).toThrow(
      "Invalid recipient address for 'mybtc' (NETWORK_MISMATCH: mainnet address)."
    )
    expect(configService.get).toHaveBeenCalledWith('customNetworks.mybtc.config.network')
  })
})
