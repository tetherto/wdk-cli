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
import { validateNetwork } from '../config/networks.js'
import { isIndexerSupported, INDEXER_TOKENS, getTokenTransfers, type IndexerToken } from '../services/indexer-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { requireUnlockedWallet } from '../utils/wallet.js'

export interface GetHistoryInput {
  network: string
  index: number
  token?: string
  limit?: number
  fromDate?: string
  toDate?: string
  wallet?: string
}

export interface HistoryTransfer {
  timestamp: number
  from: string
  to: string
  amount: string
  transactionHash: string
}

export interface HistoryResult {
  network: string
  index: number
  address: string
  token: IndexerToken
  transfers: HistoryTransfer[]
  count: number
}

export async function getHistory(input: GetHistoryInput): Promise<HistoryResult> {
  const wallet = await requireUnlockedWallet(input.wallet)
  validateNetwork(input.network)
  if (!isIndexerSupported(input.network)) {
    throw new WdkCliError(
      `Network '${input.network}' is not supported by the indexer API.`,
      ErrorCode.NETWORK_NOT_SUPPORTED,
    )
  }

  const tokenInput = input.token || 'usdt'
  if (!(INDEXER_TOKENS as readonly string[]).includes(tokenInput)) {
    throw new WdkCliError(
      `Invalid token '${tokenInput}'. Valid: ${INDEXER_TOKENS.join(', ')}`,
      ErrorCode.INVALID_TOKEN,
    )
  }
  const token = tokenInput as IndexerToken

  const limit = input.limit ?? 30
  const fromTs = input.fromDate ? Math.floor(new Date(input.fromDate).getTime() / 1000) : undefined
  const toTs = input.toDate ? Math.floor(new Date(input.toDate).getTime() / 1000) : undefined

  const address = await daemonClient.getAddress(input.network, input.index, wallet)
  const transfers = await getTokenTransfers(input.network, token, address, { limit, fromTs, toTs }) as HistoryTransfer[]
  return {
    network: input.network,
    index: input.index,
    address,
    token,
    transfers,
    count: transfers.length,
  }
}
