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

/** @typedef {import('../types/index.js').IndexerEntry} IndexerEntry */

import { configService } from './config-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import walletsFileRaw from '../../wdk.config.json' with { type: 'json' }

/** @type {import('../types/index.js').WdkConfigFile} */
const walletsFile = walletsFileRaw

/**
 * @typedef {'usdt' | 'usat' | 'xaut' | 'btc'} IndexerToken
 */

/**
 * @typedef {Object} TokenTransfer
 * @property {string} blockchain - The blockchain identifier.
 * @property {number} blockNumber - The block number of the transfer.
 * @property {string} transactionHash - The transaction hash.
 * @property {number} transferIndex - The index of the transfer within the transaction.
 * @property {string} token - The token symbol.
 * @property {string} amount - The transfer amount as a string.
 * @property {number} timestamp - The Unix timestamp of the transfer.
 * @property {number} transactionIndex - The transaction index within the block.
 * @property {number} logIndex - The log index within the transaction.
 * @property {string} from - The sender address.
 * @property {string} to - The recipient address.
 * @property {string} [label] - An optional human-readable label.
 */

/**
 * @typedef {Object} TokenTransferOptions
 * @property {number} [limit] - Maximum number of transfers to return.
 * @property {number} [fromTs] - Start timestamp filter (Unix seconds).
 * @property {number} [toTs] - End timestamp filter (Unix seconds).
 */

/**
 * @typedef {Object} BatchTransferRequestItem
 * @property {string} blockchain - The blockchain identifier.
 * @property {IndexerToken} token - The token symbol to query.
 * @property {string} address - The wallet address to query.
 * @property {number} [limit] - Maximum number of transfers to return.
 * @property {number} [fromTs] - Start timestamp filter (Unix seconds).
 * @property {number} [toTs] - End timestamp filter (Unix seconds).
 */

/**
 * @typedef {{ transfers: TokenTransfer[] } | { error: string, message: string, status: number }} BatchTransferResultItem
 */

/** @type {Record<string, IndexerEntry>} */
const INDEXER_MAP = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  if (entry.indexer) {
    INDEXER_MAP[name] = entry.indexer
  }
}

export const INDEXER_TOKENS = Object.freeze(['usdt', 'usat', 'xaut', 'btc'])

/**
 * Looks up the indexer entry for a network.
 *
 * @param {string} network - The network name.
 * @returns {IndexerEntry | undefined} The indexer entry, or undefined if not found.
 */
function getIndexerEntry(network) {
  if (INDEXER_MAP[network]) return INDEXER_MAP[network]
  return /** @type {IndexerEntry | undefined} */ (configService.get(`customNetworks.${network}.indexer`))
}

/**
 * Returns the indexer blockchain identifier for a network.
 *
 * @param {string} network - The network name.
 * @returns {string | undefined} The blockchain identifier, or undefined if not supported.
 */
export function getIndexerBlockchain(network) {
  return getIndexerEntry(network)?.blockchain
}

/**
 * Returns the supported indexer tokens for a network.
 *
 * @param {string} network - The network name.
 * @returns {IndexerToken[]} Array of supported token symbols.
 */
export function getIndexerTokens(network) {
  const entry = getIndexerEntry(network)
  if (!entry) return []
  return /** @type {IndexerToken[]} */ (entry.tokens.filter((t) => INDEXER_TOKENS.includes(t)))
}

/**
 * Returns whether the indexer API is supported for a network.
 *
 * @param {string} network - The network name.
 * @returns {boolean} True if the network has an indexer entry.
 */
export function isIndexerSupported(network) {
  return !!getIndexerEntry(network)
}

/**
 * Fetches token transfer history for a single address from the indexer API.
 *
 * @param {string} network - The network name.
 * @param {IndexerToken} token - The token symbol to query.
 * @param {string} address - The wallet address.
 * @param {TokenTransferOptions} [options] - Optional filter parameters.
 * @returns {Promise<TokenTransfer[]>} Array of token transfers.
 */
export async function getTokenTransfers(network, token, address, options = {}) {
  const blockchain = getIndexerBlockchain(network)
  if (!blockchain) {
    throw new WdkCliError(`Network '${network}' is not supported by the indexer API.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  }

  const baseUrl = /** @type {string | undefined} */ (configService.get('indexer.baseUrl'))
  const apiKey = /** @type {string | undefined} */ (configService.get('indexer.apiKey'))

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

  /** @type {Record<string, string>} */
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

/**
 * Fetches token transfer history for multiple addresses in a single batch request.
 *
 * @param {BatchTransferRequestItem[]} items - The batch request items.
 * @returns {Promise<BatchTransferResultItem[]>} Array of per-item results.
 */
export async function getTokenTransfersBatch(items) {
  if (items.length === 0) return []

  const baseUrl = /** @type {string | undefined} */ (configService.get('indexer.baseUrl'))
  const apiKey = /** @type {string | undefined} */ (configService.get('indexer.apiKey'))

  if (!baseUrl) {
    throw new WdkCliError(
      'Indexer base URL not configured. Set indexer.baseUrl or WDK_INDEXER_BASE_URL.',
      ErrorCode.MISSING_CONFIG
    )
  }

  /** @type {Record<string, string>} */
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
