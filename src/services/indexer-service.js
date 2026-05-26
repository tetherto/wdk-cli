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
import { WdkCliError, ErrorCode } from '../errors/index.js'
import walletsFile from '../../wdk.config.json' with { type: 'json' }

const INDEXER_MAP = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  if (entry.indexer) {
    INDEXER_MAP[name] = entry.indexer
  }
}

export const INDEXER_TOKENS = Object.freeze(['usdt', 'usat', 'xaut', 'btc'])

function getIndexerEntry(network) {
  if (INDEXER_MAP[network]) return INDEXER_MAP[network]
  return configService.get(`customNetworks.${network}.indexer`)
}

export function getIndexerBlockchain(network) {
  return getIndexerEntry(network)?.blockchain
}

export function getIndexerTokens(network) {
  const entry = getIndexerEntry(network)
  if (!entry) return []
  return entry.tokens.filter((t) => INDEXER_TOKENS.includes(t))
}

export function isIndexerSupported(network) {
  return !!getIndexerEntry(network)
}

export async function getTokenTransfers(network, token, address, options = {}) {
  const blockchain = getIndexerBlockchain(network)
  if (!blockchain) {
    throw new WdkCliError(`Network '${network}' is not supported by the indexer API.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  }

  const baseUrl = configService.get('indexer.baseUrl')
  const apiKey = configService.get('indexer.apiKey')

  if (!baseUrl) {
    throw new WdkCliError(
      'Indexer base URL not configured. Set indexer.baseUrl or WDK_INDEXER_BASE_URL.',
      ErrorCode.MISSING_CONFIG
    )
  }

  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.fromTs) params.set('fromTs', String(options.fromTs))
  if (options.toTs) params.set('toTs', String(options.toTs))

  const qs = params.toString() ? `?${params.toString()}` : ''
  const url = `${baseUrl}/api/v1/${blockchain}/${token}/${address}/token-transfers${qs}`

  const headers = {}
  if (apiKey) headers['x-api-key'] = apiKey

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })

  if (!response.ok) {
    if (response.status === 403) {
      throw new WdkCliError(
        `Indexer API error: 403 Forbidden. Please set your API key or use a proxy API for the indexer provider:\n` +
        `  wdk config set indexer.apiKey <your-api-key>\n` +
        `  wdk config set indexer.baseUrl <your-proxy-url>`,
        ErrorCode.NETWORK_ERROR
      )
    }
    throw new WdkCliError(`Indexer API error: ${response.status} ${response.statusText}`, ErrorCode.NETWORK_ERROR)
  }

  const data = await response.json()
  return data.transfers ?? []
}

export async function getTokenTransfersBatch(items) {
  if (items.length === 0) return []

  const baseUrl = configService.get('indexer.baseUrl')
  const apiKey = configService.get('indexer.apiKey')

  if (!baseUrl) {
    throw new WdkCliError(
      'Indexer base URL not configured. Set indexer.baseUrl or WDK_INDEXER_BASE_URL.',
      ErrorCode.MISSING_CONFIG
    )
  }

  const headers = { 'content-type': 'application/json' }
  if (apiKey) headers['x-api-key'] = apiKey

  const response = await fetch(`${baseUrl}/api/v1/batch/token-transfers`, {
    method: 'POST',
    headers,
    body: JSON.stringify(items),
    signal: AbortSignal.timeout(20000)
  })

  if (!response.ok) {
    if (response.status === 403) {
      throw new WdkCliError(
        `Indexer API error: 403 Forbidden. Please set your API key or use a proxy API for the indexer provider:\n` +
        `  wdk config set indexer.apiKey <your-api-key>\n` +
        `  wdk config set indexer.baseUrl <your-proxy-url>`,
        ErrorCode.NETWORK_ERROR
      )
    }
    throw new WdkCliError(`Indexer API error: ${response.status} ${response.statusText}`, ErrorCode.NETWORK_ERROR)
  }

  return await response.json()
}
