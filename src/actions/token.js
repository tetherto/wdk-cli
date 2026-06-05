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

import { validateNetwork } from '../config/networks.js'
import {
  getAllTokens,
  getTokensForNetwork,
  getTokenByName,
  isBuiltinToken,
  saveCustomToken,
  deleteCustomToken
} from '../services/token-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('../config/wdk-tokens.js').TokenEntry} TokenEntry */
/** @typedef {import('../config/wdk-tokens.js').TokenMetadata} TokenMetadata */

/**
 * @typedef {Object} ListTokensInput
 * @property {string} [network] - Filter to a single network. Omit for every network.
 */

/**
 * @typedef {Object} ListTokensNetworkResult
 * @property {string} network
 * @property {Record<string, TokenEntry>} tokens
 */

/**
 * @typedef {Object} ListTokensAllResult
 * @property {Record<string, Record<string, TokenEntry>>} tokens
 */

/**
 * @typedef {Object} GetTokenInput
 * @property {string} network
 * @property {string} token
 */

/**
 * @typedef {{ network: string, token: string } & TokenEntry} GetTokenResult
 */

/**
 * @typedef {Object} AddTokenInput
 * @property {string} network
 * @property {string} token
 * @property {TokenEntry} entry
 */

/**
 * @typedef {{ network: string, token: string, added: true, overridesBuiltin?: true } & TokenEntry} AddTokenResult
 */

/**
 * @typedef {Object} DeleteTokenInput
 * @property {string} network
 * @property {string} token
 */

/**
 * @typedef {Object} DeleteTokenResult
 * @property {string} network
 * @property {string} token
 * @property {true} deleted
 * @property {true} [revertedToBuiltin] - True when the deleted entry was overriding a built-in,
 *   which is now effective again.
 */

/**
 * Validates a structured token entry object. Throws `INVALID_ARGUMENT` on any
 * malformed field. Returns the cleaned-up entry suitable for persisting.
 *
 * @param {unknown} data
 * @returns {TokenEntry}
 */
export function validateTokenEntry (data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new WdkCliError('Token data must be an object.', ErrorCode.INVALID_ARGUMENT)
  }
  const obj = /** @type {Record<string, unknown>} */ (data)
  const { symbol, decimals, isNative, address, metadata } = obj

  if (typeof symbol !== 'string' || !symbol) {
    throw new WdkCliError(
      'Token "symbol" must be a non-empty string.',
      ErrorCode.INVALID_ARGUMENT
    )
  }
  const decimalsNum = /** @type {number} */ (decimals)
  if (!Number.isInteger(decimalsNum) || decimalsNum < 0 || decimalsNum > 24) {
    throw new WdkCliError(
      'Token "decimals" must be an integer between 0 and 24.',
      ErrorCode.INVALID_ARGUMENT
    )
  }
  if (typeof isNative !== 'boolean') {
    throw new WdkCliError('Token "isNative" must be a boolean.', ErrorCode.INVALID_ARGUMENT)
  }
  if (address !== undefined && (typeof address !== 'string' || !address)) {
    throw new WdkCliError(
      'Token "address" must be a non-empty string when provided.',
      ErrorCode.INVALID_ARGUMENT
    )
  }
  if (!isNative && !address) {
    throw new WdkCliError(
      'Non-native tokens require an "address".',
      ErrorCode.INVALID_ARGUMENT
    )
  }

  /** @type {TokenEntry} */
  const entry = { symbol, decimals: decimalsNum, isNative }
  if (typeof address === 'string') entry.address = address

  if (metadata !== undefined) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new WdkCliError(
        'Token "metadata" must be an object when provided.',
        ErrorCode.INVALID_ARGUMENT
      )
    }
    const meta = /** @type {Record<string, unknown>} */ (metadata)
    /** @type {TokenMetadata} */
    const clean = {}
    for (const key of /** @type {const} */ (['indexerSlug', 'moonpaySlug', 'bitfinexSlug'])) {
      const value = meta[key]
      if (value === undefined) continue
      if (typeof value !== 'string' || !value) {
        throw new WdkCliError(
          `Token "metadata.${key}" must be a non-empty string when provided.`,
          ErrorCode.INVALID_ARGUMENT
        )
      }
      clean[key] = value
    }
    if (Object.keys(clean).length > 0) entry.metadata = clean
  }

  return entry
}

/**
 * @typedef {Object} TokenSpec
 * @property {string} network
 * @property {string} token - Registry key (e.g. "usdt")
 * @property {TokenEntry} entry - Validated token entry
 */

/**
 * Validates a `wdk token add` spec object. Type-checks the known fields and
 * delegates the entry-shaped portion to `validateTokenEntry`. Unknown top-level
 * fields pass through silently so users can annotate their specs without the
 * CLI complaining.
 *
 * @param {unknown} data
 * @returns {TokenSpec}
 */
export function validateTokenSpec (data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new WdkCliError('Token spec must be a JSON object.', ErrorCode.INVALID_ARGUMENT)
  }
  const obj = /** @type {Record<string, unknown>} */ (data)

  const network = obj.network
  if (typeof network !== 'string' || !network) {
    throw new WdkCliError(
      'Token spec "network" must be a non-empty string.',
      ErrorCode.INVALID_ARGUMENT
    )
  }

  const token = obj.token
  if (typeof token !== 'string' || !token) {
    throw new WdkCliError(
      'Token spec "token" must be a non-empty string (registry key).',
      ErrorCode.INVALID_ARGUMENT
    )
  }

  const { network: _n, token: _t, ...rest } = obj
  const entry = validateTokenEntry(rest)
  return { network, token: token.toLowerCase(), entry }
}

/**
 * Lists registered tokens, optionally filtered to a single network.
 *
 * @param {ListTokensInput} [input]
 * @returns {ListTokensNetworkResult | ListTokensAllResult}
 */
export function listTokens (input = {}) {
  if (input.network) {
    validateNetwork(input.network)
    return { network: input.network, tokens: getTokensForNetwork(input.network) }
  }
  return { tokens: getAllTokens() }
}

/**
 * Returns the registered token entry for the given network + token.
 *
 * @param {GetTokenInput} input
 * @returns {GetTokenResult}
 * @throws {WdkCliError} When the token is not registered on the network.
 */
export function getToken (input) {
  validateNetwork(input.network)
  const entry = getTokenByName(input.network, input.token)
  if (!entry) {
    throw new WdkCliError(
      `Token '${input.token}' not found on '${input.network}'.`,
      ErrorCode.TOKEN_NOT_SUPPORTED
    )
  }
  return { network: input.network, token: input.token.toLowerCase(), ...entry }
}

/**
 * Adds or overrides a token entry. Persists under `customTokens.<network>.<token>`.
 * The caller is responsible for any user confirmation (e.g. passphrase prompt).
 *
 * @param {AddTokenInput} input
 * @returns {AddTokenResult}
 */
export function addToken (input) {
  validateNetwork(input.network)
  const entry = validateTokenEntry(input.entry)
  const ticker = input.token.toLowerCase()

  if (entry.isNative) {
    const tokens = getTokensForNetwork(input.network)
    for (const [existingTicker, existingEntry] of Object.entries(tokens)) {
      if (existingEntry.isNative && existingTicker !== ticker) {
        throw new WdkCliError(
          `Network '${input.network}' already has native token '${existingTicker}' (${existingEntry.symbol}). ` +
            `Each network can have at most one native token. Delete '${existingTicker}' first if you want to replace it.`,
          ErrorCode.INVALID_ARGUMENT
        )
      }
    }
  }

  const overridesBuiltin = isBuiltinToken(input.network, input.token)
  saveCustomToken(input.network, input.token, entry)
  return {
    network: input.network,
    token: ticker,
    added: true,
    ...(overridesBuiltin ? { overridesBuiltin: true } : {}),
    ...entry
  }
}

/**
 * Deletes a custom token entry. Built-in entries cannot be deleted.
 *
 * @param {DeleteTokenInput} input
 * @returns {DeleteTokenResult}
 * @throws {WdkCliError} When the token is built-in (no custom override to remove) or unknown.
 */
export function deleteToken (input) {
  validateNetwork(input.network)
  const removed = deleteCustomToken(input.network, input.token)
  if (removed) {
    const revertedToBuiltin = isBuiltinToken(input.network, input.token)
    return {
      network: input.network,
      token: input.token.toLowerCase(),
      deleted: true,
      ...(revertedToBuiltin ? { revertedToBuiltin: true } : {})
    }
  }

  if (isBuiltinToken(input.network, input.token)) {
    throw new WdkCliError(
      `'${input.token}' on '${input.network}' is a built-in token and cannot be deleted.`,
      ErrorCode.INVALID_ARGUMENT,
      'Use `wdk token add` to override its fields instead.'
    )
  }
  throw new WdkCliError(
    `Token '${input.token}' not found on '${input.network}'.`,
    ErrorCode.TOKEN_NOT_SUPPORTED
  )
}
