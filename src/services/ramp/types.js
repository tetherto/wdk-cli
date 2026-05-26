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

/** @typedef {import('../../config/ramp.js').RampModule} RampModule */

/**
 * @typedef {'buy' | 'sell'} Direction
 */

/**
 * @typedef {Object} ResolvedAssets
 * @property {string} cryptoCode - The provider-canonical crypto asset code.
 * @property {number} cryptoDecimals - The number of decimals for the crypto asset.
 * @property {number} fiatDecimals - The number of decimals for the fiat currency.
 */

/**
 * @typedef {Object} RampInput
 * @property {string} network - The blockchain network name.
 * @property {string} token - The token alias.
 * @property {string} walletAddress - The wallet address for receiving (buy) or refunding (sell).
 * @property {string} fiatCurrency - The fiat currency code (e.g. "usd").
 * @property {bigint} [fiatAmount] - The fiat amount in base units.
 * @property {bigint} [cryptoAmount] - The crypto amount in base units.
 * @property {number} fiatDecimals - The number of decimals for the fiat currency.
 * @property {number} cryptoDecimals - The number of decimals for the crypto asset.
 */

/**
 * @typedef {Object} QuoteResult
 * @property {bigint} fiatAmount - The fiat amount in base units.
 * @property {bigint} cryptoAmount - The crypto amount in base units.
 * @property {bigint} fee - The provider fee in fiat base units.
 * @property {string} rate - The fiat-per-crypto rate as a decimal string.
 */

/**
 * @typedef {Object} UrlResult
 * @property {string} url - The hosted widget URL for the buy or sell flow.
 */

/**
 * The contract every on-ramp / off-ramp provider must implement.
 *
 * @typedef {Object} RampProvider
 * @property {RampModule} name - The provider identifier.
 * @property {(network: string) => void} validateEnvironment - Throws if the provider environment does not match the network (e.g. production vs. testnet).
 * @property {(network: string, token: string, fiatCurrency: string) => Promise<ResolvedAssets>} resolveAssets - Resolves provider-canonical asset codes and decimals.
 * @property {(input: RampInput, direction: Direction) => Promise<QuoteResult | undefined>} quote - Returns a price quote, or undefined when the provider cannot quote this pair/direction.
 * @property {(input: RampInput, direction: Direction) => Promise<UrlResult>} buildUrl - Builds the hosted widget URL for the requested direction.
 */

export {}
