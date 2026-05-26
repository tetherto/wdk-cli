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

import { daemonClient } from '../daemon/client.js'
import { validateNetwork, getAllNetworkNames, isTestnet } from '../config/networks.js'
import { requireUnlockedWallet } from '../utils/wallet.js'

/**
 * @typedef {Object} GetAddressInput
 * @property {string} network - The blockchain network name (e.g. "ethereum", "bitcoin").
 * @property {number} index - The BIP-44 account index.
 * @property {string} [wallet] - The wallet name (defaults to the active wallet).
 */

/**
 * @typedef {Object} AddressResult
 * @property {string} network - The blockchain network name.
 * @property {number} index - The BIP-44 account index.
 * @property {string} address - The derived account address.
 */

/**
 * Derives the wallet address for a given network and account index.
 *
 * @param {GetAddressInput} input - The address lookup parameters.
 * @returns {Promise<AddressResult>} The derived address.
 */
export async function getAddress(input) {
  const wallet = await requireUnlockedWallet(input.wallet)
  validateNetwork(input.network)
  const address = await daemonClient.getAddress(input.network, input.index, wallet)
  return { network: input.network, index: input.index, address }
}

/**
 * @typedef {Object} GetAllAddressesInput
 * @property {number} index - The BIP-44 account index.
 * @property {boolean} [testnet] - When true, only testnets are returned; otherwise only mainnets.
 * @property {string} [wallet] - The wallet name (defaults to the active wallet).
 */

/**
 * @typedef {Object} AddressRow
 * @property {string} network - The blockchain network name.
 * @property {string} address - The derived account address.
 */

/**
 * @typedef {Object} AllAddressesResult
 * @property {number} index - The BIP-44 account index.
 * @property {'mainnet' | 'testnet'} type - Which network group was queried.
 * @property {AddressRow[]} addresses - The derived addresses, one per network that succeeded.
 */

/**
 * Derives addresses for every supported network (mainnet or testnet) at the given account index.
 * Networks that fail to derive are skipped silently.
 *
 * @param {GetAllAddressesInput} input - The lookup parameters.
 * @returns {Promise<AllAddressesResult>} The derived addresses.
 */
export async function getAllAddresses(input) {
  const wallet = await requireUnlockedWallet(input.wallet)
  const showTestnet = !!input.testnet
  const names = getAllNetworkNames().filter((n) => isTestnet(n) === showTestnet)

  const tasks = names.map(async (network) => {
    try {
      const address = await daemonClient.getAddress(network, input.index, wallet)
      return { network, address }
    } catch {
      return null
    }
  })

  const rows = (await Promise.all(tasks)).filter((r) => r !== null)
  return {
    index: input.index,
    type: showTestnet ? 'testnet' : 'mainnet',
    addresses: rows
  }
}
