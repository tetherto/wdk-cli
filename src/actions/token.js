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

/** @typedef {import('../services/token-service.js').TokenEntry} TokenEntry */
/** @typedef {import('../config/wdk-tokens.js').TokenMetadata} TokenMetadata */

/**
 * Validates that a token name matches the registry key shape: lowercase
 * alphanumeric, optionally with hyphens. Throws on any mismatch.
 *
 * @param {unknown} value - The token name to validate.
 * @returns {string} The validated token name (unchanged).
 * @throws {WdkCliError} INVALID_ARGUMENT when `value` is not a valid token name.
 */
export function validateTokenName (value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new WdkCliError(
      `Invalid token name '${value}'.`,
      ErrorCode.INVALID_ARGUMENT
    )
  }
  return value
}

/**
 * @typedef {Object} ListTokensInput
 * @property {string} [network] - Filter to a single network. Omit for every network.
 */

/**
 * @typedef {Object} ListTokensNetworkResult
 * @property {string} network - The network the listing is scoped to.
 * @property {Record<string, TokenEntry>} tokens - Tokens keyed by registry key (lowercased).
 */

/**
 * @typedef {Object} ListTokensAllResult
 * @property {Record<string, Record<string, TokenEntry>>} tokens - Tokens keyed first by network, then by registry key.
 */

/**
 * @typedef {Object} GetTokenInput
 * @property {string} network - The network the token belongs to.
 * @property {string} token - Registry key (must be lowercase alphanumeric).
 */

/**
 * @typedef {{ network: string, token: string } & TokenEntry} GetTokenResult
 *   The matched entry's fields, plus its `network` and `token` key.
 */

/**
 * @typedef {Object} AddTokenInput
 * @property {string} network - The network the token belongs to.
 * @property {string} token - Registry key (must be lowercase alphanumeric).
 * @property {TokenEntry} entry - Validated entry to persist under `customTokens.<network>.<token>`.
 */

/**
 * @typedef {{ network: string, token: string, added: true, overridesBuiltin?: true } & TokenEntry} AddTokenResult
 *   The persisted entry's fields, plus `network`, `token`, `added: true`,
 *   and optional `overridesBuiltin: true` when the new entry overrides a built-in of the same ticker.
 */

/**
 * @typedef {Object} DeleteTokenInput
 * @property {string} network - The network the token belongs to.
 * @property {string} token - Registry key (must be lowercase alphanumeric).
 */

/**
 * @typedef {Object} DeleteTokenResult
 * @property {string} network - The network the token was removed from.
 * @property {string} token - Registry key of the removed entry.
 * @property {true} deleted - Always `true` on a successful response.
 * @property {true} [revertedToBuiltin] - True when the deleted entry was overriding a built-in,
 *   which is now effective again.
 */

/**
 * Validates a structured token entry object. Throws `INVALID_ARGUMENT` on any
 * malformed field. Returns the cleaned-up entry suitable for persisting.
 *
 * @param {unknown} data - Raw token-entry JSON (untrusted input).
 * @returns {TokenEntry} The validated entry.
 * @throws {WdkCliError} INVALID_ARGUMENT on any malformed field.
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
 * @property {string} network - The parent network the token belongs to.
 * @property {string} token - Registry key (lowercase alphanumeric; e.g. "usdt").
 * @property {TokenEntry} entry - Validated token entry.
 */

/**
 * Validates a `wdk token add` spec object. Type-checks the known fields and
 * delegates the entry-shaped portion to `validateTokenEntry`. Unknown top-level
 * fields are silently ignored so users can annotate their specs without the
 * CLI complaining.
 *
 * @param {unknown} data - Raw spec JSON (untrusted input).
 * @returns {TokenSpec} The validated and normalized spec.
 * @throws {WdkCliError} INVALID_ARGUMENT on any malformed field.
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
  validateTokenName(token)

  const { network: _n, token: _t, ...rest } = obj
  const entry = validateTokenEntry(rest)
  return { network, token, entry }
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
 * @throws {WdkCliError} NETWORK_NOT_SUPPORTED when the network is unknown.
 * @throws {WdkCliError} TOKEN_NOT_SUPPORTED when no entry matches the ticker on that network.
 */
export function getToken (input) {
  validateNetwork(input.network)
  validateTokenName(input.token)
  const entry = getTokenByName(input.network, input.token)
  if (!entry) {
    throw new WdkCliError(
      `Token '${input.token}' not found on '${input.network}'.`,
      ErrorCode.TOKEN_NOT_SUPPORTED
    )
  }
  return { network: input.network, token: input.token, ...entry }
}

/**
 * Adds or overrides a token entry. Persists under `customTokens.<network>.<token>`.
 * The caller is responsible for any user confirmation (e.g. passphrase prompt).
 *
 * @param {AddTokenInput} input
 * @returns {AddTokenResult}
 * @throws {WdkCliError} NETWORK_NOT_SUPPORTED when the network is unknown.
 * @throws {WdkCliError} INVALID_ARGUMENT when `input.entry` is malformed, or when
 *   `entry.isNative` conflicts with an existing native token on the network.
 */
export function addToken (input) {
  validateNetwork(input.network)
  validateTokenName(input.token)
  const entry = validateTokenEntry(input.entry)

  if (entry.isNative) {
    const tokens = getTokensForNetwork(input.network)
    for (const [existingTicker, existingEntry] of Object.entries(tokens)) {
      if (existingEntry.isNative && existingTicker !== input.token) {
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
    token: input.token,
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
 * @throws {WdkCliError} NETWORK_NOT_SUPPORTED when the network is unknown.
 * @throws {WdkCliError} INVALID_ARGUMENT when the entry is built-in (no custom override to remove).
 * @throws {WdkCliError} TOKEN_NOT_SUPPORTED when the entry is unknown on the network.
 */
export function deleteToken (input) {
  validateNetwork(input.network)
  validateTokenName(input.token)
  const removed = deleteCustomToken(input.network, input.token)
  if (removed) {
    const revertedToBuiltin = isBuiltinToken(input.network, input.token)
    return {
      network: input.network,
      token: input.token,
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
