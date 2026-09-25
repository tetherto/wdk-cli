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
 *   Per-token indexer slugs live in `wdk.tokens.json` under `metadata.slugs.indexer`.
 * @property {string} [chainId] - The CAIP-2 chain id (e.g. "eip155:1", "tron:mainnet").
 * @property {Record<string, unknown>} [config] - The per-network module configuration (RPC URL, chainId, etc.).
 * @property {Record<string, Record<string, unknown>>} [providers] - Per-network provider config overrides,
 *   keyed by provider short name; shallow-merged over the provider's general `config`.
 */

/**
 * @typedef {string | Record<string, unknown> | unknown[]} MethodParamType
 * A parameter type: a scalar type string (`string`, `bigint`, `number`, `boolean`,
 * or their `[]` array forms, with a trailing `?` marking it optional), a nested
 * object schema, or a single-element array holding the element schema. Structured
 * parameters are passed as JSON strings and are always required.
 */

/**
 * @typedef {Object} MethodEntry
 * @property {'read' | 'write'} kind - Whether the method mutates state.
 * @property {'positional' | 'object'} [style] - How params are passed to the module method:
 *   one argument per param in declaration order (default), or a single options object.
 * @property {Record<string, MethodParamType>} params - Parameter name to type.
 */

/**
 * @typedef {Object} WdkModuleEntry
 * @property {string} version - The pinned module version.
 * @property {Record<string, MethodEntry>} [methods] - The invocable module methods keyed by method name.
 */

/**
 * What a provider does: `swap` serves same-network swaps, `bridge` moves one
 * token across networks, `swidge` serves both, `fiat` is an on/off ramp,
 * `pricing` is a USD price feed, and `indexer` is a transfer-history API.
 *
 * @typedef {'swap' | 'bridge' | 'swidge' | 'fiat' | 'pricing' | 'indexer'} ProtocolKind
 */

/**
 * @typedef {Object} WdkProtocolEntry
 * @property {ProtocolKind} kind - What the provider does; see {@link ProtocolKind} for each value.
 * @property {string} [module] - The protocol module package name; its version is pinned in
 *   `modules`. Absent for a provider the CLI calls directly rather than through a module.
 * @property {Record<string, unknown>} [config] - General protocol config applied on every network
 *   (e.g. API keys); shallow-merged under any per-network override in `networks.<n>.providers.<name>`.
 * @property {Record<string, Record<string, unknown>>} [networks] - Per-network config overrides keyed by
 *   network name. Used by user-added providers, which cannot edit the packaged network entries.
 * @property {string[]} [endpointKeys] - Config keys the module takes as a callback rather than a
 *   value. The CLI stores a URL for each and POSTs to it when the module calls back.
 */

/**
 * @typedef {Object} WdkConfigFile
 * @property {number} version - The config file format version.
 * @property {Record<string, unknown>} defaults - The default global configuration.
 * @property {Record<string, WdkModuleEntry>} modules - The WDK module registry keyed by package name.
 * @property {Record<string, WdkProtocolEntry>} [providers] - The service providers keyed by short name.
 * @property {Record<string, WdkNetworkEntry>} networks - The network definitions keyed by network name.
 */

/** @type {WdkConfigFile} */
export const walletsFile = walletsFileRaw
