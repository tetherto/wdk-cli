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

import walletsFileRaw from '../../wdk.config.json' with { type: 'json' }

/**
 * @typedef {Object} IndexerEntry
 * @property {string} blockchain - The indexer blockchain identifier.
 * @property {string[]} tokens - The token symbols supported by the indexer for this network.
 */

/**
 * @typedef {Object} WdkNetworkEntry
 * @property {string} module - The wallet module package name.
 * @property {string} displayName - The human-readable network name.
 * @property {string} nativeSymbol - The native currency symbol.
 * @property {number} decimals - The number of decimals for the native currency.
 * @property {boolean} [testnet] - True when the network is a testnet.
 * @property {IndexerEntry} [indexer] - The indexer configuration for this network.
 * @property {{ moonpay?: Record<string, string> }} [ramp] - The ramp provider configuration keyed by provider name.
 * @property {Record<string, unknown>} [config] - The per-network module configuration.
 */

/**
 * @typedef {Object} WdkConfigFile
 * @property {number} version - The config file format version.
 * @property {Record<string, unknown>} defaults - The default global configuration.
 * @property {Record<string, WdkNetworkEntry>} networks - The network definitions keyed by network name.
 */

/** @type {WdkConfigFile} */
export const walletsFile = walletsFileRaw
