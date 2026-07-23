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
 * @property {string} [indexerSlug] - The token slug used by the indexer API (e.g. "usdt").
 * @property {string} [moonpaySlug] - The asset slug used by MoonPay (e.g. "usdt_polygon").
 * @property {string} [bitfinexSlug] - The Bitfinex pair slug for USD price (e.g. "tUSTUSD").
 */

/**
 * A token asset entry, following the `@tetherto/wdk-asset-registry` TokenAsset
 * shape plus the CLI-specific fields (`network`, `slug`, `testnet`, `metadata`).
 *
 * @typedef {Object} CliTokenAsset
 * @property {string} id - Unique asset id, `<network>/<slug>` (e.g. "ethereum/usdt").
 * @property {string} chainId - CAIP-2 chain id (e.g. "eip155:1", "tron:mainnet").
 * @property {string} network - The CLI network name the asset belongs to.
 * @property {string} slug - The lower-case token key used by `--token <token>`.
 * @property {string} symbol - The display symbol (e.g. "USDT", "ETH").
 * @property {string} name - The token name.
 * @property {number} decimals - The number of decimal places.
 * @property {boolean} isNative - True when this token is the chain's native asset.
 * @property {string} [address] - Contract/mint address. Absent for native assets.
 * @property {boolean} testnet - True when the asset belongs to a testnet network.
 * @property {TokenMetadata} [metadata] - Optional provider-specific mappings.
 */

/**
 * The top-level shape of `wdk.tokens.json`. Version 2: a flat list of token
 * assets in registry format (version 1 was a network-keyed map).
 *
 * @typedef {Object} WdkTokensFile
 * @property {number} version - The tokens file format version.
 * @property {CliTokenAsset[]} assets - The built-in token assets.
 */

/** @type {WdkTokensFile} */
export const tokensFile = tokensFileRaw
