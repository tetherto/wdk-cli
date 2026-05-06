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

import { configService } from './config-service.js'
import type { NetworkName, WdkConfigFile } from '../types/index.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import walletsFileRaw from '../../wdk.config.json' with { type: 'json' }

const walletsFile = walletsFileRaw as WdkConfigFile

const BLOCKCHAIN_MAP: Record<string, string> = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  if (entry.indexerBlockchain) {
    BLOCKCHAIN_MAP[name] = entry.indexerBlockchain
  }
}

export type IndexerToken = 'usdt' | 'usat' | 'xaut' | 'btc'

export const INDEXER_TOKENS: IndexerToken[] = ['usdt', 'usat', 'xaut', 'btc']

export interface TokenTransfer {
  blockchain: string
  blockNumber: number
  transactionHash: string
  transferIndex: number
  token: string
  amount: string
  timestamp: number
  transactionIndex: number
  logIndex: number
  from: string
  to: string
  label?: string
}

export function getIndexerBlockchain(network: NetworkName): string | undefined {
  if (BLOCKCHAIN_MAP[network]) return BLOCKCHAIN_MAP[network]
  return configService.get<string>(`customNetworks.${network}.indexerBlockchain`)
}

export function isIndexerSupported(network: NetworkName): boolean {
  return !!getIndexerBlockchain(network)
}

export async function getTokenTransfers(
  network: NetworkName,
  token: IndexerToken,
  address: string,
  options: { limit?: number; fromTs?: number; toTs?: number } = {},
): Promise<TokenTransfer[]> {
  const blockchain = getIndexerBlockchain(network)
  if (!blockchain) {
    throw new WdkCliError(`Network '${network}' is not supported by the indexer API.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  }

  const baseUrl = configService.get<string>('indexer.baseUrl')
  const apiKey = configService.get<string>('indexer.apiKey')

  if (!baseUrl) throw new WdkCliError('Indexer base URL not configured. Set indexer.baseUrl or WDK_INDEXER_BASE_URL.', ErrorCode.MISSING_CONFIG)

  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.fromTs) params.set('fromTs', String(options.fromTs))
  if (options.toTs) params.set('toTs', String(options.toTs))

  const qs = params.toString() ? `?${params.toString()}` : ''
  const url = `${baseUrl}/api/v1/${blockchain}/${token}/${address}/token-transfers${qs}`

  const headers: Record<string, string> = {}
  if (apiKey) headers['x-api-key'] = apiKey

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })

  if (!response.ok) {
    if (response.status === 403) {
      throw new WdkCliError(
        `Indexer API error: 403 Forbidden. Please set your API key or use a proxy API for the indexer provider:\n` +
        `  wdk config set indexer.apiKey <your-api-key>\n` +
        `  wdk config set indexer.baseUrl <your-proxy-url>`,
        ErrorCode.NETWORK_ERROR,
      )
    }
    throw new WdkCliError(`Indexer API error: ${response.status} ${response.statusText}`, ErrorCode.NETWORK_ERROR)
  }

  const data = await response.json() as { transfers: TokenTransfer[] }
  return data.transfers ?? []
}
