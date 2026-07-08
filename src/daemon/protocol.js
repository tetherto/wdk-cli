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

/**
 * @typedef {'get_address' | 'get_balance' | 'estimate_fee' | 'send' | 'list_wallets' | 'status' | 'unlock_wallet' | 'lock_wallet' | 'lock'} DaemonAction
 */

/**
 * @typedef {Object} DaemonRequest
 * @property {DaemonAction} action - The action to perform.
 * @property {string} [wallet] - The wallet name.
 * @property {string} [passphrase] - The wallet passphrase (only for unlock).
 * @property {number} [ttl] - The unlock TTL in minutes (only for unlock).
 * @property {string} [network] - The blockchain network name.
 * @property {number} [index] - The BIP-44 account index.
 * @property {string} [token] - The token symbol.
 * @property {string} [to] - The recipient address.
 * @property {string} [amount] - The transfer amount in base units.
 */

/**
 * @typedef {Object} DaemonResponse
 * @property {boolean} ok - True when the request succeeded.
 * @property {unknown} [data] - The action-specific result payload.
 * @property {string} [error] - The error message when ok is false.
 * @property {string} [code] - Stable error code preserved across IPC (e.g. WRONG_PASSPHRASE, INSUFFICIENT_FUNDS).
 * @property {string} [suggestion] - Optional user-facing hint when ok is false.
 */

/** @typedef {{ address: string }} GetAddressResult */
/** @typedef {{ balance: string, symbol: string, decimals: number }} GetBalanceResult */
/** @typedef {{ fee: string, feeFormatted: string }} EstimateFeeResult */
/** @typedef {{ txHash: string, network: string, from: string, to: string, amount: string, fee?: string }} SendResult */
/** @typedef {{ name: string, ttlMs: number, ttlRemaining: number }} WalletStatus */
/** @typedef {{ wallets: WalletStatus[] }} ListWalletsResult */
/** @typedef {{ unlocked: boolean, wallets: WalletStatus[], pid: number }} StatusResult */

export {}
