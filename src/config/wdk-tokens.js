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

const tokensFileRaw = createRequire(import.meta.url)('../../wdk.tokens.json')

/**
 * Provider-specific external mappings for a token. Each field is optional and
 * may be absent when the token is not supported by that provider.
 *
 * @typedef {Object} TokenMetadata
 * @property {string} [indexer] - The token code used by the indexer API (e.g. "usdt").
 * @property {string} [moonpay] - The asset code used by MoonPay (e.g. "usdt_polygon").
 * @property {string} [bitfinex] - The Bitfinex trading pair for USD price (e.g. "tUSTUSD").
 */

/**
 * A single token entry in the registry.
 *
 * @typedef {Object} TokenEntry
 * @property {string} symbol - The display symbol (e.g. "USDT", "ETH").
 * @property {number} decimals - The number of decimal places.
 * @property {boolean} isNative - True when this token is the chain's native asset (use native transfer path).
 * @property {string} [address] - Contract/mint address. Required for non-native sends; optional for native (wrapped/protocol representation).
 * @property {TokenMetadata} [metadata] - Optional provider-specific mappings.
 */

/**
 * The top-level shape of `wdk.tokens.json`. Tokens are grouped first by network
 * name, then by token (lower-case key used to invoke the token by `--token <token>`).
 *
 * @typedef {Object} WdkTokensFile
 * @property {number} version - The tokens file format version.
 * @property {Record<string, Record<string, TokenEntry>>} tokens - Tokens keyed by network, then by token.
 */

/** @type {WdkTokensFile} */
export const tokensFile = tokensFileRaw
