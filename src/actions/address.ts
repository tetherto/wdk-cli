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

export interface GetAddressInput {
  network: string
  index: number
  wallet?: string
}

export interface AddressResult {
  network: string
  index: number
  address: string
}

export async function getAddress(input: GetAddressInput): Promise<AddressResult> {
  const wallet = await requireUnlockedWallet(input.wallet)
  validateNetwork(input.network)
  const address = await daemonClient.getAddress(input.network, input.index, wallet)
  return { network: input.network, index: input.index, address }
}

export interface GetAllAddressesInput {
  index: number
  testnet?: boolean
  wallet?: string
}

export interface AddressRow {
  network: string
  address: string
}

export interface AllAddressesResult {
  index: number
  type: 'mainnet' | 'testnet'
  addresses: AddressRow[]
}

export async function getAllAddresses(input: GetAllAddressesInput): Promise<AllAddressesResult> {
  const wallet = await requireUnlockedWallet(input.wallet)
  const showTestnet = !!input.testnet
  const names = getAllNetworkNames().filter((n) => isTestnet(n) === showTestnet)

  const tasks = names.map(async (network): Promise<AddressRow | null> => {
    try {
      const address = await daemonClient.getAddress(network, input.index, wallet)
      return { network, address }
    } catch { return null }
  })

  const rows = (await Promise.all(tasks)).filter((r): r is AddressRow => r !== null)
  return {
    index: input.index,
    type: showTestnet ? 'testnet' : 'mainnet',
    addresses: rows,
  }
}
