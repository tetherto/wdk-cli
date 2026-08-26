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

import { WdkCliError, ErrorCode } from '../errors/index.js'

/**
 * @typedef {Object} ProtocolQuote
 * @property {string} protocol - The protocol name that produced the quote.
 * @property {bigint} outputAmount - The estimated amount of destination token received (base units).
 * @property {unknown} [fees] - The provider's itemised fee breakdown.
 * @property {unknown} raw - The provider's raw quote, for downstream use.
 */

/**
 * Picks the quote with the highest output amount. Ties keep the first, which
 * preserves the order protocols were quoted in.
 *
 * @param {ProtocolQuote[]} quotes - Non-empty list of successful quotes.
 * @returns {ProtocolQuote} The best quote.
 */
export function pickBest (quotes) {
  return quotes.reduce((best, q) => (q.outputAmount > best.outputAmount ? q : best))
}

/**
 * @typedef {Object} RouteContext
 * @property {string} fromToken - Source token symbol (for the no-route message).
 * @property {string} toToken - Destination token symbol.
 * @property {string} network - Source network name.
 * @property {string} [toNetwork] - Destination network name, when cross-network.
 * @property {number} checked - How many protocols were attempted.
 */

/**
 * Selects the best quote from a set of settled quote attempts. Failed or
 * unsupported attempts are dropped; when none succeed, one aggregate error is
 * raised naming the request rather than surfacing each protocol's failure.
 *
 * @param {PromiseSettledResult<ProtocolQuote | null>[]} settled - Results of quoting each capable protocol.
 * @param {RouteContext} context - Request context for the no-route error.
 * @returns {ProtocolQuote} The best quote.
 * @throws {WdkCliError} When no protocol returned a usable quote.
 */
export function selectBestQuote (settled, context) {
  const quotes = settled
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => /** @type {PromiseFulfilledResult<ProtocolQuote>} */ (r).value)

  if (quotes.length === 0) {
    const route = context.toNetwork && context.toNetwork !== context.network
      ? `${context.fromToken} (${context.network}) → ${context.toToken} (${context.toNetwork})`
      : `${context.fromToken} → ${context.toToken} on ${context.network}`
    throw new WdkCliError(
      `No route found for ${route}. Checked ${context.checked} protocol(s).`,
      ErrorCode.QUOTE_REJECTED,
      'Try a different amount or token pair, or add a protocol that supports this route.'
    )
  }
  return pickBest(quotes)
}
