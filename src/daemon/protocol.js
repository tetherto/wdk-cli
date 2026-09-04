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
 * @typedef {'get_address' | 'get_balance' | 'estimate_fee' | 'send' | 'list_wallets' | 'status' | 'unlock_wallet' | 'lock_wallet' | 'lock' | 'call_method' | 'quote_swap' | 'quote_bridge' | 'execute_swap' | 'execute_bridge'} DaemonAction
 */

/**
 * A token as it crosses the IPC boundary for a quote: its contract address and
 * decimals. Native assets use the sentinel address (see actions/swap.js).
 *
 * @typedef {Object} QuoteToken
 * @property {string} address - The token contract address (or native sentinel).
 * @property {number} decimals - The token's decimals.
 * @property {string} symbol - The token symbol (for provider identifier resolution).
 * @property {boolean} isNative - Whether the token is the chain's native asset.
 */

/**
 * A swap/bridge quote request. Amounts are decimal strings because BigInt
 * cannot cross the JSON socket; the daemon converts them. Exactly one of
 * `amountIn` / `amountOut` is set. `fromSymbol` / `toSymbol` / `toNetwork` are
 * carried only for the no-route message.
 *
 * @typedef {Object} QuoteRequest
 * @property {QuoteToken} fromToken - The resolved source token.
 * @property {QuoteToken} toToken - The resolved destination token.
 * @property {string | number} [toChain] - The destination chain, when it differs from the source.
 * @property {string} [amountIn] - Exact input amount in base units.
 * @property {string} [amountOut] - Exact output amount in base units.
 * @property {string} [recipient] - The address that receives the output.
 * @property {number} [slippage] - Max slippage as a decimal (swidge only).
 * @property {string} fromSymbol - Source token symbol, for messaging.
 * @property {string} toSymbol - Destination token symbol, for messaging.
 * @property {string} [toNetwork] - Destination network name, when cross-network.
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
 * @property {string} [method] - The module method name (only for call_method).
 * @property {Record<string, string>} [args] - Raw method argument strings (only for call_method).
 * @property {string} [protocol] - Force a specific protocol (only for quote_swap/quote_bridge).
 * @property {QuoteRequest} [request] - The quote request (only for quote_swap/quote_bridge).
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
/** @typedef {{ protocol: string, reason: string }} SkippedProtocol */
/** @typedef {{ protocol: string, inputAmount?: string, outputAmount: string, fees: unknown, skipped?: SkippedProtocol[] }} QuoteResult */
/** @typedef {{ protocol: string, result: unknown, skipped?: SkippedProtocol[] }} ExecuteResult */
/** @typedef {{ wallets: WalletStatus[] }} ListWalletsResult */
/** @typedef {{ unlocked: boolean, wallets: WalletStatus[], pid: number }} StatusResult */

export {}
