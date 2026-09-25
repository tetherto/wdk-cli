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
import { getAllTokens, getTokenByName, tokenSlugValue, getTokensSupportedBy } from './token-service.js'
import { getOwn } from './override-service.js'
import { WdkIndexerClient, WdkIndexerApiError } from '@tetherto/wdk-indexer-http'
import { resolveProtocolConfig, resolveSoleProvider } from './protocol-service.js'

/**
 * The system key the indexer's token codes are registered under in
 * `metadata.slugs`. Independent of the provider's name: the code is the token
 * segment of the indexer URL, not a vendor's vocabulary.
 */
const INDEXER_SLUG_KEY = 'indexer'

/** The kind an indexer provider declares in the registry. */
const INDEXER_KIND = 'indexer'

/**
 * Returns the name of the enabled indexer provider.
 *
 * @returns {string} The provider short name.
 * @throws {WdkCliError} MISSING_CONFIG when no indexer provider is enabled.
 * @throws {WdkCliError} INVALID_ARGUMENT when several are enabled at once.
 */
function indexerProvider () {
  return resolveSoleProvider(INDEXER_KIND, 'indexer')
}

/**
 * Checks that exactly one indexer provider is enabled, so a caller can fail
 * before doing expensive work such as unlocking a wallet or deriving an address.
 *
 * @returns {void}
 * @throws {WdkCliError} MISSING_CONFIG when no indexer provider is enabled.
 * @throws {WdkCliError} INVALID_ARGUMENT when several are enabled at once.
 */
export function assertIndexerAvailable () {
  indexerProvider()
}

/**
 * Builds the indexer client from its registry entry, merged with the user's
 * `providers.<name>.config` deltas.
 *
 * @returns {{ name: string, client: WdkIndexerClient }} The client and the provider
 *   it came from, for config-key hints.
 * @throws {WdkCliError} MISSING_CONFIG when no indexer is enabled, or its config is incomplete.
 * @throws {WdkCliError} INVALID_ARGUMENT when several are enabled at once.
 */
function indexerClient () {
  const name = indexerProvider()
  try {
    const config = /** @type {IndexerConfig} */ (/** @type {unknown} */ (resolveProtocolConfig(name)))
    return { name, client: new WdkIndexerClient(config) }
  } catch (error) {
    throw apiError(error, name)
  }
}

/**
 * Translates a client error into the CLI's own, so a 403 carries the config
 * keys that fix it against the provider actually in use.
 *
 * @param {unknown} error - What the client threw.
 * @param {string} name - The resolved provider's short name.
 * @returns {WdkCliError} The error to throw.
 */
function apiError (error, name) {
  const hint =
    `Check its config, then update with: wdk config set --key providers.${name}.config.<setting> --value <value>`

  if (error instanceof WdkIndexerApiError && error.status === 403) {
    return new WdkCliError(
      'Indexer API error: 403 Forbidden. The configured API key was rejected.',
      ErrorCode.NETWORK_ERROR,
      hint
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  // Matched by name: these are exported at runtime but absent from the .d.ts.
  if (error instanceof Error && error.name === 'WdkIndexerValidationError') {
    return new WdkCliError(message, ErrorCode.NETWORK_NOT_SUPPORTED)
  }
  if (error instanceof Error && error.name === 'WdkIndexerError') {
    return new WdkCliError(
      `Indexer is not configured: ${message}`,
      ErrorCode.MISSING_CONFIG,
      hint
    )
  }
  return new WdkCliError(`Indexer API error: ${message}`, ErrorCode.NETWORK_ERROR)
}

/** @typedef {import('@tetherto/wdk-indexer-http').TokenTransfer} TokenTransfer */
/** @typedef {import('@tetherto/wdk-indexer-http').WdkIndexerConfig} IndexerConfig */
/** @typedef {import('@tetherto/wdk-indexer-http').Blockchain} Blockchain */
/** @typedef {import('@tetherto/wdk-indexer-http').Token} Token */

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
 * Derived from each token's indexer slug across the whole token registry.
 *
 * @type {readonly string[]}
 */
export const INDEXER_TOKENS = [
  ...new Set(
    Object.values(getAllTokens()).flatMap((tokens) =>
      Object.values(tokens)
        .map((t) => tokenSlugValue(t, INDEXER_SLUG_KEY))
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
  return getOwn(BUILTIN_INDEXER_SLUGS, network) ?? /** @type {string | undefined} */ (
    configService.get(`customNetworks.${network}.indexerSlug`)
  )
}

/**
 * Returns the indexer codes supported for a network, collected from the token
 * registry's indexer slug on each entry.
 *
 * @param {string} network - The network name.
 * @returns {string[]} Array of indexer token codes (e.g. ["usdt", "btc"]).
 */
export function getIndexerTokens (network) {
  const codes = new Set()
  for (const token of getTokensSupportedBy(network, INDEXER_SLUG_KEY)) {
    const code = tokenSlugValue(getTokenByName(network, token), INDEXER_SLUG_KEY)
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
 * @throws {WdkCliError} NETWORK_NOT_SUPPORTED when the network has no `indexerSlug`, or the
 *   indexer does not carry it.
 * @throws {WdkCliError} MISSING_CONFIG when no indexer is enabled, or its config is incomplete.
 * @throws {WdkCliError} INVALID_ARGUMENT when several indexers are enabled at once.
 * @throws {WdkCliError} NETWORK_ERROR when the indexer API rejects the request.
 */
export async function getTokenTransfers (network, token, address, options = {}) {
  if (!isIndexerSupported(network)) {
    throw new WdkCliError(
      `Network '${network}' is not supported by the indexer API.`,
      ErrorCode.NETWORK_NOT_SUPPORTED
    )
  }
  const blockchain = getIndexerSlug(network)
  const { name, client } = indexerClient()

  try {
    const data = await client.getTokenTransfers(
      /** @type {Blockchain} */ (blockchain),
      /** @type {Token} */ (token),
      address,
      options
    )
    return data.transfers ?? []
  } catch (error) {
    throw apiError(error, name)
  }
}

/**
 * Fetches token transfer history for multiple addresses in a single batch request.
 *
 * @param {BatchTransferRequestItem[]} items - The batch request items.
 * @returns {Promise<BatchTransferResultItem[]>} Array of per-item results.
 * @throws {WdkCliError} MISSING_CONFIG when no indexer is enabled, or its config is incomplete.
 * @throws {WdkCliError} INVALID_ARGUMENT when several indexers are enabled at once.
 * @throws {WdkCliError} NETWORK_ERROR when the indexer API rejects the request.
 */
export async function getTokenTransfersBatch (items) {
  if (items.length === 0) return []

  const { name, client } = indexerClient()

  try {
    return await client.getBatchTokenTransfers(
      /** @type {import('@tetherto/wdk-indexer-http').BatchTokenTransfersRequest[]} */ (items)
    )
  } catch (error) {
    throw apiError(error, name)
  }
}
