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

import { createRequire } from 'node:module'
import { configService } from '../services/config-service.js'

const tokensFile = createRequire(import.meta.url)('../../wdk.tokens.json')

/**
 * @typedef {Object} TokenConfig
 * @property {string} address - The token contract address.
 * @property {string} symbol - The token symbol (e.g. USDT).
 * @property {number} decimals - The number of decimal places.
 */

const BUILTIN_TOKENS = tokensFile

function getAllTokens (network) {
  if (BUILTIN_TOKENS[network]) return BUILTIN_TOKENS[network]
  const custom = configService.get(`customNetworks.${network}.tokens`)
  return custom ?? []
}

function normalizeAddress (address) {
  return address.startsWith('0x') ? address.toLowerCase() : address
}

/** @type {Map<string, Map<string, TokenConfig>>} */
const lookupCache = new Map()

function getLookup (network) {
  let map = lookupCache.get(network)
  if (!map) {
    map = new Map()
    for (const token of getAllTokens(network)) {
      map.set(normalizeAddress(token.address), token)
    }
    lookupCache.set(network, map)
  }
  return map
}

/**
 * Returns the token config for a given network and contract address.
 *
 * @param {string} network - Network name.
 * @param {string} address - Token contract address.
 * @returns {TokenConfig | undefined} The token config, or undefined if not found.
 */
export function getTokenConfig (network, address) {
  return getLookup(network).get(normalizeAddress(address))
}

/**
 * Returns all known token configs for a given network.
 *
 * @param {string} network - Network name.
 * @returns {TokenConfig[]} Array of token configs.
 */
export function getKnownTokens (network) {
  return getAllTokens(network)
}
