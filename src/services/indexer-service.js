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
import { walletsFile } from '../config/wdk-config.js'
import { getAllTokens, getIndexerCode, getTokensSupportedBy } from './token-service.js'

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
 * @property {string} token - The token symbol to query.
 * @property {string} address - The wallet address to query.
 * @property {number} [limit] - Maximum number of transfers to return.
 * @property {number} [fromTs] - Start timestamp filter (Unix seconds).
 * @property {number} [toTs] - End timestamp filter (Unix seconds).
 */

/**
 * @typedef {{ transfers: TokenTransfer[] } | { error: string, message: string, status: number }} BatchTransferResultItem
 */

/** @type {Record<string, string>} */
const BUILTIN_INDEXER_SLUGS = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  if (entry.indexerSlug) BUILTIN_INDEXER_SLUGS[name] = entry.indexerSlug
}

/**
 * The universe of indexer token codes known to any registered token.
 * Derived from `metadata.indexerSlug` across the whole token registry.
 *
 * @type {readonly string[]}
 */
export const INDEXER_TOKENS = [
  ...new Set(
    Object.values(getAllTokens()).flatMap((tokens) =>
      Object.values(tokens)
        .map((t) => t.metadata?.indexerSlug)
        .filter((c) => typeof c === 'string' && c.length > 0)
    )
  )
]

/**
 * Returns the indexer chain slug for a network, or `undefined` when the network
 * has no `indexerSlug` configured. Absence is the authoritative signal that the
 * indexer is not available for the network — callers should check via
 * `isIndexerSupported` (or this function's return value) before constructing
 * indexer URLs.
 *
 * Built-ins set `indexerSlug` in `wdk.config.json`; custom networks set it via
 * `customNetworks.<name>.indexerSlug`.
 *
 * @param {string} network - The network name.
 * @returns {string | undefined} The chain slug, or undefined if not configured.
 */
export function getIndexerSlug (network) {
  if (BUILTIN_INDEXER_SLUGS[network]) return BUILTIN_INDEXER_SLUGS[network]
  return /** @type {string | undefined} */ (
    configService.get(`customNetworks.${network}.indexerSlug`)
  )
}

/**
 * Returns the indexer codes supported for a network, collected from the token
 * registry's `metadata.indexerSlug` field on each entry.
 *
 * @param {string} network - The network name.
 * @returns {string[]} Array of indexer token codes (e.g. ["usdt", "btc"]).
 */
export function getIndexerTokens (network) {
  const codes = new Set()
  for (const token of getTokensSupportedBy(network, 'indexerSlug')) {
    const code = getIndexerCode(network, token)
    if (code) codes.add(code)
  }
  return [...codes]
}

/**
 * Returns whether the indexer API is supported for a network. A network is
 * supported when it has an `indexerSlug` configured (either as a built-in
 * field in `wdk.config.json` or under `customNetworks.<name>.indexerSlug`).
 *
 * @param {string} network - The network name.
 * @returns {boolean} True if the network has an `indexerSlug` configured.
 */
export function isIndexerSupported (network) {
  return getIndexerSlug(network) !== undefined
}

/**
 * Fetches token transfer history for a single address from the indexer API.
 *
 * @param {string} network - The network name.
 * @param {string} token - The token symbol to query.
 * @param {string} address - The wallet address.
 * @param {TokenTransferOptions} [options] - Optional filter parameters.
 * @returns {Promise<TokenTransfer[]>} Array of token transfers.
 */
export async function getTokenTransfers (network, token, address, options = {}) {
  if (!isIndexerSupported(network)) {
    throw new WdkCliError(
      `Network '${network}' is not supported by the indexer API.`,
      ErrorCode.NETWORK_NOT_SUPPORTED
    )
  }
  const blockchain = getIndexerSlug(network)

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
        'Indexer API error: 403 Forbidden. Please set your API key or use a proxy API for the indexer provider:\n' +
          '  wdk config set indexer.apiKey <your-api-key>\n' +
          '  wdk config set indexer.baseUrl <your-proxy-url>',
        ErrorCode.NETWORK_ERROR
      )
    }
    throw new WdkCliError(
      `Indexer API error: ${response.status} ${response.statusText}`,
      ErrorCode.NETWORK_ERROR
    )
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
export async function getTokenTransfersBatch (items) {
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
        'Indexer API error: 403 Forbidden. Please set your API key or use a proxy API for the indexer provider:\n' +
          '  wdk config set indexer.apiKey <your-api-key>\n' +
          '  wdk config set indexer.baseUrl <your-proxy-url>',
        ErrorCode.NETWORK_ERROR
      )
    }
    throw new WdkCliError(
      `Indexer API error: ${response.status} ${response.statusText}`,
      ErrorCode.NETWORK_ERROR
    )
  }

  return await response.json()
}
