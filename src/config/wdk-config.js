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

const walletsFileRaw = createRequire(import.meta.url)('../../wdk.config.json')

/**
 * @typedef {Object} WdkNetworkEntry
 * @property {string} module - The wallet module package name.
 * @property {string} displayName - The human-readable network name.
 * @property {boolean} [testnet] - True when the network is a testnet.
 * @property {string} [indexerSlug] - Optional override for the indexer chain slug.
 *   Defaults to the network name. Set only when they differ (e.g. `smart-account-ethereum` → `ethereum`).
 *   Per-token indexer slugs live in `wdk.tokens.json` under `metadata.indexerSlug`.
 * @property {string} [chainId] - The CAIP-2 chain id (e.g. "eip155:1", "tron:mainnet").
 * @property {Record<string, unknown>} [config] - The per-network module configuration (RPC URL, chainId, etc.).
 */

/**
 * @typedef {Object} WdkConfigFile
 * @property {number} version - The config file format version.
 * @property {Record<string, unknown>} defaults - The default global configuration.
 * @property {Record<string, WdkNetworkEntry>} networks - The network definitions keyed by network name.
 */

/** @type {WdkConfigFile} */
export const walletsFile = walletsFileRaw
