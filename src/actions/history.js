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
import {
  isIndexerSupported,
  getIndexerSlug,
  getIndexerTokens,
  getTokenTransfers,
  getTokenTransfersBatch
} from '../services/indexer-service.js'
import { getTokenByName } from '../services/token-service.js'
import { formatAmount } from '../ui/formatters.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('../services/indexer-service.js').TokenTransfer} TokenTransfer */

/**
 * Enriches a raw indexer transfer with `decimals` and a human-readable
 * `formatted` amount, looked up via the token registry. Falls back to the
 * raw amount when the token isn't registered on the network.
 *
 * @param {string} network - The blockchain network the transfer belongs to.
 * @param {TokenTransfer} t - The raw transfer record from the indexer.
 * @returns {HistoryTransfer} The transfer with `formatted` (and `decimals` when known) added.
 */
function enrichTransfer (network, t) {
  const entry = getTokenByName(network, t.token)
  const decimals = entry?.decimals
  const formatted = typeof decimals === 'number'
    ? formatAmount(BigInt(t.amount), decimals, t.token.toUpperCase())
    : `${t.amount} ${t.token.toUpperCase()}`
  return {
    timestamp: t.timestamp,
    from: t.from ?? '',
    to: t.to ?? '',
    amount: t.amount,
    formatted,
    ...(typeof decimals === 'number' ? { decimals } : {}),
    transactionHash: t.transactionHash,
    token: t.token
  }
}

/**
 * @typedef {Object} GetHistoryInput
 * @property {string} network - The blockchain network name.
 * @property {number} index - The BIP-44 account index.
 * @property {string} [token] - Specific token to query (e.g. "usdt"); omit for all supported.
 * @property {number} [limit] - Maximum number of transfers to return (default: 30).
 * @property {string} [fromDate] - ISO 8601 start date filter (e.g. "2026-01-01").
 * @property {string} [toDate] - ISO 8601 end date filter (e.g. "2026-12-31").
 * @property {string} [wallet] - The wallet name (defaults to the active wallet).
 */

/**
 * @typedef {Object} HistoryTransfer
 * @property {number} timestamp - Unix timestamp of the transfer.
 * @property {string} from - Sender address.
 * @property {string} to - Recipient address.
 * @property {string} amount - Transfer amount in base units.
 * @property {string} formatted - Human-readable amount string (e.g. "1.5 USDT").
 * @property {number} [decimals] - Token decimals from the registry (omitted for unknown tokens).
 * @property {string} transactionHash - On-chain transaction hash.
 * @property {string} token - Token symbol or identifier.
 */

/**
 * @typedef {Object} HistoryResult
 * @property {string} network - The blockchain network name.
 * @property {number} index - The BIP-44 account index.
 * @property {string} address - The wallet address that was queried.
 * @property {string | string[]} token - The token(s) that were queried.
 * @property {HistoryTransfer[]} transfers - The matched transfer records.
 * @property {number} count - Number of transfers returned.
 */

/**
 * Returns token transfer history for a wallet address on the given network.
 *
 * @param {GetHistoryInput} input - The history lookup parameters.
 * @returns {Promise<HistoryResult>} The history result.
 */
export async function getHistory (input) {
  const wallet = await daemonClient.requireUnlocked(input.wallet)
  validateNetwork(input.network)
  if (!isIndexerSupported(input.network)) {
    throw new WdkCliError(
      `Network '${input.network}' is not supported by the indexer API.`,
      ErrorCode.NETWORK_NOT_SUPPORTED
    )
  }

  if (input.token) {
    const supported = getIndexerTokens(input.network)
    if (!supported.includes(input.token)) {
      throw new WdkCliError(
        `Token '${input.token}' is not supported by the indexer on '${input.network}'. Supported: ${supported.join(', ')}`,
        ErrorCode.TOKEN_NOT_SUPPORTED
      )
    }
  }

  const limit = input.limit ?? 30
  const fromTs = input.fromDate ? Math.floor(new Date(input.fromDate).getTime() / 1000) : undefined
  const toTs = input.toDate ? Math.floor(new Date(input.toDate).getTime() / 1000) : undefined

  const address = await daemonClient.getAddress(input.network, input.index, wallet)

  if (input.token) {
    const transfers = await getTokenTransfers(input.network, input.token, address, {
      limit,
      fromTs,
      toTs
    })
    return {
      network: input.network,
      index: input.index,
      address,
      token: input.token,
      transfers: transfers.map((t) => enrichTransfer(input.network, t)),
      count: transfers.length
    }
  }

  const blockchain = getIndexerSlug(input.network)
  const supportedTokens = getIndexerTokens(input.network)
  if (supportedTokens.length === 0) {
    throw new WdkCliError(
      `Network '${input.network}' has no indexer-supported tokens configured.`,
      ErrorCode.NETWORK_NOT_SUPPORTED
    )
  }
  const items = supportedTokens.map((token) => ({
    blockchain,
    token,
    address,
    limit,
    ...(fromTs !== undefined ? { fromTs } : {}),
    ...(toTs !== undefined ? { toTs } : {})
  }))
  const results = await getTokenTransfersBatch(items)
  const merged = []
  for (const r of results) {
    if ('transfers' in r) {
      for (const t of r.transfers) {
        merged.push(enrichTransfer(input.network, t))
      }
    }
  }
  merged.sort((a, b) => b.timestamp - a.timestamp)
  const transfers = merged.slice(0, limit)
  return {
    network: input.network,
    index: input.index,
    address,
    token: supportedTokens,
    transfers,
    count: transfers.length
  }
}
