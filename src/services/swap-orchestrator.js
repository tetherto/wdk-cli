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

import {
  getProtocols,
  getProtocol,
  resolveProtocolConfig,
  detectKind,
  servesRequest,
  loadProtocolClass
} from './protocol-service.js'
import { buildOptions } from './protocol-adapter.js'
import { pickBest, buildNoRouteError } from './routing.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('./protocol-service.js').ProtocolKind} ProtocolKind */
/** @typedef {import('./routing.js').ProtocolQuote} ProtocolQuote */
/** @typedef {import('./protocol-adapter.js').SwapRequest} SwapRequest */

/**
 * The quote method exposed by each protocol kind.
 *
 * @type {Record<ProtocolKind, 'quoteSwap' | 'quoteBridge' | 'quoteSwidge'>}
 */
const QUOTE_METHOD = {
  swap: 'quoteSwap',
  bridge: 'quoteBridge',
  swidge: 'quoteSwidge'
}

/**
 * Caches the constructed protocol instance per `(account, protocol)` for the
 * session. Keyed by the account object, so entries clear when the wallet locks
 * and the account is garbage-collected.
 *
 * We construct protocols directly (`new ProtocolClass(account, config)`) rather
 * than via WDK's `account.registerProtocol`, whose `instanceof SwapProtocol`
 * check fails when a protocol pins a different `@tetherto/wdk-wallet` version and
 * npm nests a separate copy. Direct construction yields the identical instance
 * (all WDK's register step does) without that version-identity coupling.
 *
 * @type {WeakMap<object, Map<string, object>>}
 */
const instancesByAccount = new WeakMap()

/**
 * @typedef {Object} CapableProtocol
 * @property {string} name - The protocol short name.
 * @property {Function} ProtocolClass - The protocol's class (default export).
 * @property {ProtocolKind} kind - The protocol's own detected kind.
 */

/**
 * @typedef {Object} RouteRequestContext
 * @property {string} fromToken - Source token symbol, for the no-route message.
 * @property {string} toToken - Destination token symbol, for the no-route message.
 * @property {string} [toNetwork] - Destination network name, when cross-network.
 */

/**
 * Resolves the set of protocols to quote for a request. With an explicit
 * `protocol` override the named protocol must exist, be installed, and be able
 * to serve the request — any of those failing throws. Without an override,
 * every configured protocol that is installed and capable is returned;
 * uninstalled protocols are skipped (lazy install), and an empty result throws.
 *
 * @param {'swap' | 'bridge'} requestKind - The kind of request being served.
 * @param {string} [protocol] - Optional protocol short name to force.
 * @returns {Promise<CapableProtocol[]>} The capable protocols to quote.
 * @throws {WdkCliError} When the override is unusable, or nothing capable is installed.
 */
export async function resolveCandidates (requestKind, protocol) {
  if (protocol) {
    const entry = getProtocol(protocol)
    const ProtocolClass = await loadProtocolClass(entry.module)
    const kind = detectKind(ProtocolClass)
    if (!kind || !servesRequest(kind, requestKind)) {
      throw new WdkCliError(
        `Protocol '${protocol}' cannot ${requestKind}.`,
        ErrorCode.INVALID_ARGUMENT,
        kind ? `It is a ${kind} protocol.` : 'It exposes no swap, bridge, or swidge quote method.'
      )
    }
    return [{ name: protocol, ProtocolClass, kind }]
  }

  const protocols = getProtocols()
  const resolved = await Promise.all(
    Object.entries(protocols).map(async ([name, entry]) => {
      let ProtocolClass
      try {
        ProtocolClass = await loadProtocolClass(entry.module)
      } catch (err) {
        // An uninstalled protocol is simply not a candidate (lazy install).
        if (err instanceof WdkCliError && err.code === ErrorCode.UNSUPPORTED_MODULE) return null
        throw err
      }
      const kind = detectKind(ProtocolClass)
      if (!kind || !servesRequest(kind, requestKind)) return null
      return { name, ProtocolClass, kind }
    })
  )

  const candidates = /** @type {CapableProtocol[]} */ (resolved.filter(Boolean))
  if (candidates.length === 0) {
    throw new WdkCliError(
      `No installed protocol can ${requestKind}.`,
      ErrorCode.UNSUPPORTED_MODULE,
      'Install one with: wdk module add --name <package>'
    )
  }
  return candidates
}

/**
 * Returns the protocol instance for an `(account, protocol)` pair, constructing
 * it directly with the account and its network-effective config on first use
 * and caching it for the rest of the session.
 *
 * @param {any} account - The wallet account.
 * @param {CapableProtocol} capable - The protocol to instantiate.
 * @param {string} network - The network the account is bound to.
 * @returns {object} The protocol instance, exposing the kind's quote method.
 */
function getProtocolInstance (account, capable, network) {
  let instances = instancesByAccount.get(account)
  if (!instances) {
    instances = new Map()
    instancesByAccount.set(account, instances)
  }

  let instance = instances.get(capable.name)
  if (!instance) {
    const config = resolveProtocolConfig(capable.name, network)
    const ProtocolClass = /** @type {new (account: any, config: object) => object} */ (capable.ProtocolClass)
    instance = new ProtocolClass(account, config)
    instances.set(capable.name, instance)
  }
  return instance
}

/**
 * Normalizes a protocol's raw quote into the comparable {@link ProtocolQuote}
 * shape. Swap and swidge report the destination amount directly; bridge is
 * same-token so the received amount equals the input and providers differ only
 * on fees.
 *
 * @param {ProtocolKind} kind - The protocol's kind.
 * @param {string} name - The protocol short name.
 * @param {any} raw - The provider's raw quote.
 * @param {SwapRequest} request - The request, for the bridge input amount.
 * @returns {ProtocolQuote} The normalized quote.
 */
export function normalizeQuote (kind, name, raw, request) {
  switch (kind) {
    case 'swap':
      return {
        protocol: name,
        inputAmount: BigInt(raw.tokenInAmount),
        outputAmount: BigInt(raw.tokenOutAmount),
        fees: { gas: BigInt(raw.fee) },
        raw
      }
    case 'bridge':
      return {
        protocol: name,
        inputAmount: /** @type {bigint} */ (request.amountIn),
        outputAmount: /** @type {bigint} */ (request.amountIn),
        fees: { gas: BigInt(raw.fee), bridge: BigInt(raw.bridgeFee) },
        raw
      }
    case 'swidge':
      return {
        protocol: name,
        inputAmount: BigInt(raw.fromTokenAmount),
        outputAmount: BigInt(raw.toTokenAmount),
        fees: raw.fees,
        raw
      }
    default:
      throw new WdkCliError(`Unsupported protocol kind '${kind}'.`, ErrorCode.INVALID_ARGUMENT)
  }
}

/**
 * Quotes a single protocol: gets its instance, builds the kind-specific
 * options, calls its quote method, and normalizes the result.
 *
 * @param {any} account - The wallet account.
 * @param {CapableProtocol} capable - The protocol to quote.
 * @param {string} network - The network the account is bound to.
 * @param {SwapRequest} request - The normalized request.
 * @returns {Promise<ProtocolQuote>} The normalized quote.
 */
async function quoteOne (account, capable, network, request) {
  const instance = getProtocolInstance(account, capable, network)
  const options = buildOptions(capable.kind, request)
  const raw = await instance[QUOTE_METHOD[capable.kind]](options)
  return normalizeQuote(capable.kind, capable.name, raw, request)
}

/**
 * Reduces an error to a short, single-line reason for listing next to a
 * protocol name. Prefers ethers' `shortMessage` over the giant `message`.
 *
 * @param {unknown} err - The thrown value.
 * @returns {string} A short reason.
 */
function shortReason (err) {
  const e = /** @type {{ shortMessage?: string, message?: string }} */ (err)
  const msg = (e && (e.shortMessage || e.message)) || String(err)
  return msg.length > 140 ? msg.slice(0, 140) + '…' : msg
}

/**
 * @typedef {import('./routing.js').ProtocolFailure} ProtocolFailure
 */

/**
 * @typedef {Object} QuoteBestResult
 * @property {ProtocolQuote} quote - The winning quote.
 * @property {ProtocolFailure[]} failures - The protocols that were tried but did not quote, with reasons.
 */

/**
 * Quotes every candidate protocol concurrently and returns the winner along
 * with the reasons any others failed. Slow or failing providers never block the
 * others. When nothing succeeds it throws: a single forced protocol surfaces
 * its own full error; otherwise the error lists every protocol's reason. On
 * success the failures are returned (not thrown) so the caller can disclose
 * which protocols were skipped — a better route may exist once they are fixed.
 *
 * @param {Object} params
 * @param {any} params.account - The wallet account (source chain bound to it).
 * @param {string} params.network - The source network name.
 * @param {SwapRequest} params.request - The normalized request.
 * @param {RouteRequestContext} params.context - Display context for the no-route message.
 * @param {CapableProtocol[]} params.candidates - The protocols to quote.
 * @returns {Promise<QuoteBestResult>} The winning quote plus per-protocol failures.
 * @throws {WdkCliError} When no candidate returned a usable quote.
 */
export async function quoteCandidates ({ account, network, request, context, candidates }) {
  const settled = await Promise.allSettled(
    candidates.map((c) => quoteOne(account, c, network, request))
  )

  /** @type {ProtocolQuote[]} */
  const quotes = []
  /** @type {ProtocolFailure[]} */
  const failures = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      quotes.push(r.value)
    } else {
      const reason = r.status === 'rejected' ? shortReason(r.reason) : 'no quote returned'
      failures.push({ protocol: candidates[i].name, reason })
    }
  })

  if (quotes.length === 0) {
    // A single forced protocol: surface its full error, which is richer than
    // a one-item list (keeps the provider's hint, code, etc.).
    if (candidates.length === 1 && settled[0].status === 'rejected') {
      throw /** @type {PromiseRejectedResult} */ (settled[0]).reason
    }
    throw buildNoRouteError({
      fromToken: context.fromToken,
      toToken: context.toToken,
      network,
      toNetwork: context.toNetwork,
      failures
    })
  }

  return { quote: pickBest(quotes), failures }
}

/**
 * Best-route entry point: resolves the capable protocols for the request, then
 * quotes them all and returns the winner plus any per-protocol failures.
 *
 * @param {Object} params
 * @param {any} params.account - The wallet account.
 * @param {'swap' | 'bridge'} params.requestKind - The request kind.
 * @param {string} params.network - The source network name.
 * @param {SwapRequest} params.request - The normalized request.
 * @param {RouteRequestContext} params.context - Display context for the no-route message.
 * @param {string} [params.protocol] - Optional protocol short name to force.
 * @returns {Promise<QuoteBestResult>} The winning quote plus per-protocol failures.
 */
export async function quoteBest ({ account, requestKind, network, request, context, protocol }) {
  const candidates = await resolveCandidates(requestKind, protocol)
  return quoteCandidates({ account, network, request, context, candidates })
}
