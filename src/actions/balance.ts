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
import { convertToUsd } from '../services/price-service.js'
import { formatAmount } from '../ui/formatters.js'
import { requireUnlockedWallet } from '../utils/wallet.js'
import type { NetworkName } from '../types/index.js'

export interface GetBalanceInput {
  network: string
  index: number
  token?: string
  wallet?: string
}

export interface BalanceResult {
  network: string
  index: number
  balance: string
  symbol: string
  decimals: number
  formatted: string
  usd: number
  token?: string
}

export async function getBalance(input: GetBalanceInput): Promise<BalanceResult> {
  const wallet = await requireUnlockedWallet(input.wallet)
  validateNetwork(input.network)

  const r = await daemonClient.getBalance(input.network, input.index, input.token, wallet)
  const balanceBigInt = BigInt(r.balance)
  let usd = 0
  if (balanceBigInt > 0n) {
    try { usd = await convertToUsd(input.network as NetworkName, balanceBigInt, input.token) } catch { /* no price */ }
  }
  return {
    network: input.network,
    index: input.index,
    balance: r.balance,
    symbol: r.symbol,
    decimals: r.decimals,
    formatted: formatAmount(balanceBigInt, r.decimals, r.symbol),
    usd: Math.round(usd * 100) / 100,
    ...(input.token ? { token: input.token } : {}),
  }
}

export interface GetAllBalancesInput {
  index: number
  testnet?: boolean
  wallet?: string
}

export interface BalanceRow {
  network: string
  address: string
  balance: string
  symbol: string
  decimals: number
  formatted: string
  usd: number
}

export interface AllBalancesResult {
  index: number
  type: 'mainnet' | 'testnet'
  balances: BalanceRow[]
  totalUsd: number
}

export async function getAllBalances(input: GetAllBalancesInput): Promise<AllBalancesResult> {
  const wallet = await requireUnlockedWallet(input.wallet)
  const showTestnet = !!input.testnet
  const names = getAllNetworkNames().filter((n) => isTestnet(n) === showTestnet)

  const tasks = names.map(async (network): Promise<BalanceRow | null> => {
    try {
      const address = await daemonClient.getAddress(network, input.index, wallet)
      const r = await daemonClient.getBalance(network, input.index, undefined, wallet)
      const balanceBigInt = BigInt(r.balance)
      let usd = 0
      if (balanceBigInt > 0n) {
        try { usd = await convertToUsd(network as NetworkName, balanceBigInt) } catch { /* no price */ }
      }
      return {
        network,
        address,
        balance: r.balance,
        symbol: r.symbol,
        decimals: r.decimals,
        formatted: formatAmount(balanceBigInt, r.decimals, r.symbol),
        usd,
      }
    } catch { return null }
  })

  const rows = (await Promise.all(tasks)).filter((r): r is BalanceRow => r !== null)
  const totalUsd = rows.reduce((sum, r) => sum + r.usd, 0)
  return {
    index: input.index,
    type: showTestnet ? 'testnet' : 'mainnet',
    balances: rows,
    totalUsd: Math.round(totalUsd * 100) / 100,
  }
}
