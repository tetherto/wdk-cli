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
 * @property {bigint} [inputAmount] - The source token spent (base units); computed for exact-out.
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
 * @typedef {Object} ProtocolFailure
 * @property {string} protocol - The protocol that failed.
 * @property {string} reason - A short human reason for the failure.
 */

/**
 * @typedef {Object} RouteContext
 * @property {string} fromToken - Source token symbol (for the no-route message).
 * @property {string} toToken - Destination token symbol.
 * @property {string} network - Source network name.
 * @property {string} [toNetwork] - Destination network name, when cross-network.
 * @property {ProtocolFailure[]} failures - Each attempted protocol's failure reason.
 */

/**
 * Builds the error raised when no protocol produced a usable quote. Rather than
 * claiming "no route" (which implies routing succeeded and found nothing), it
 * reports that the protocols failed to quote and lists each one's reason — so a
 * config problem (missing key, missing chain) reads as such, not as an absent
 * market.
 *
 * @param {RouteContext} context - Request context plus the per-protocol failures.
 * @returns {WdkCliError} The error to throw.
 */
export function buildNoRouteError (context) {
  const route = context.toNetwork && context.toNetwork !== context.network
    ? `${context.fromToken} (${context.network}) → ${context.toToken} (${context.toNetwork})`
    : `${context.fromToken} → ${context.toToken} on ${context.network}`

  const failures = context.failures || []
  if (failures.length === 0) {
    return new WdkCliError(
      `Could not get a quote for ${route}.`,
      ErrorCode.QUOTE_REJECTED,
      'Try a different token pair or amount, or add a protocol that supports this route.'
    )
  }

  const lines = failures.map((f) => `  • ${f.protocol} — ${f.reason}`).join('\n')
  return new WdkCliError(
    `Could not get a quote for ${route}. Tried ${failures.length} protocol(s):\n${lines}`,
    ErrorCode.QUOTE_REJECTED,
    'Fix the per-protocol issues above, or try a different token pair or amount.'
  )
}
