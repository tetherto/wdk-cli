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
import { TokenEntrySchema, TokenSpecSchema, parseSpec } from '../ui/schemas.js'

/** @typedef {import('../config/wdk-tokens.js').TokenEntry} TokenEntry */

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
 * Validates a structured token entry object via the zod schema. Returns the
 * cleaned-up entry suitable for persisting.
 *
 * @param {unknown} data - Raw token-entry JSON (untrusted input).
 * @returns {TokenEntry} The validated entry.
 * @throws {WdkCliError} INVALID_ARGUMENT on any malformed field.
 */
export function validateTokenEntry (data) {
  return /** @type {TokenEntry} */ (parseSpec(TokenEntrySchema, data, 'Token data'))
}

/**
 * @typedef {Object} TokenSpec
 * @property {string} network - The parent network the token belongs to.
 * @property {string} token - Registry key, lowercased (e.g. "usdt").
 * @property {TokenEntry} entry - Validated token entry.
 */

/**
 * Validates a `wdk token add` spec object via the zod schema. Splits the
 * parsed result into `{ network, token, entry }` for downstream consumers.
 *
 * @param {unknown} data - Raw spec JSON (untrusted input).
 * @returns {TokenSpec} The validated and normalized spec.
 * @throws {WdkCliError} INVALID_ARGUMENT on any malformed field.
 */
export function validateTokenSpec (data) {
  const parsed = parseSpec(TokenSpecSchema, data, 'Token spec')
  const { network, token, ...entryFields } = parsed
  return { network, token, entry: /** @type {TokenEntry} */ (entryFields) }
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
