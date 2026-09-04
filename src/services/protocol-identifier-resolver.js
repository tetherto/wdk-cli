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

import { walletsFile } from '../config/wdk-config.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('./protocol-adapter.js').SwapRequest} SwapRequest */

/**
 * Caches a protocol's chain/token discovery per session, keyed by the protocol
 * instance — so a best-route fan-out fetches each list once. Entries vanish when
 * the instance is garbage-collected on wallet lock.
 *
 * @type {WeakMap<object, { chains: any[] | null, tokensByChain: Map<string, any[]> }>}
 */
const cache = new WeakMap()

/**
 * @param {any} instance - The protocol instance.
 * @returns {{ chains: any[] | null, tokensByChain: Map<string, any[]> }}
 */
function cacheFor (instance) {
  let c = cache.get(instance)
  if (!c) {
    c = { chains: null, tokensByChain: new Map() }
    cache.set(instance, c)
  }
  return c
}

/**
 * Whether a protocol self-describes its tokens/chains (the swidge interface). We
 * translate identifiers only for these; swap/bridge protocols take the contract
 * address and numeric chain directly.
 *
 * @param {any} instance - The protocol instance.
 * @returns {boolean} True when the instance exposes the discovery methods.
 */
export function selfDescribes (instance) {
  return typeof instance?.getSupportedChains === 'function' &&
    typeof instance?.getSupportedTokens === 'function'
}

/**
 * Resolves our network to the provider's own chain identifier via
 * `getSupportedChains`. Matches on any of three keys, so it works whether the
 * provider keys chains by numeric chainId (symbiosis) or by a custom string
 * (rhino): the numeric chainId, the display name, or our network key.
 *
 * @param {any} instance - The self-describing protocol instance.
 * @param {string} network - Our network name (key in `wdk.config.json`).
 * @returns {Promise<string | number>} The provider's chain identifier.
 * @throws {WdkCliError} When the provider does not support the network.
 */
export async function resolveChain (instance, network) {
  const c = cacheFor(instance)
  if (!c.chains) c.chains = await instance.getSupportedChains()

  const entry = walletsFile.networks[network]
  const numericChainId = /** @type {number | undefined} */ (entry?.config?.chainId)
  const displayName = entry?.displayName

  const row = c.chains.find((chain) =>
    (typeof chain.id === 'number' && numericChainId !== undefined && chain.id === numericChainId) ||
    (chain.name && displayName && chain.name.toLowerCase() === displayName.toLowerCase()) ||
    (typeof chain.id === 'string' && chain.id.toLowerCase() === network.toLowerCase())
  )

  if (!row) {
    throw new WdkCliError(
      `Chain '${network}' is not supported by this protocol.`,
      ErrorCode.NETWORK_NOT_SUPPORTED
    )
  }
  return row.id
}

/**
 * Resolves our token to the provider's own token identifier via
 * `getSupportedTokens`, scoped to the provider's chain. Matches ERC-20s by
 * contract address (the stable, unique key) and native assets by symbol (native
 * has no consistent address across providers).
 *
 * @param {any} instance - The self-describing protocol instance.
 * @param {string | number} providerChain - The provider's chain id (from {@link resolveChain}).
 * @param {{ address: string, symbol: string, isNative: boolean }} token - Our resolved token.
 * @returns {Promise<string>} The provider's token identifier, or our address when the provider does not list it.
 */
export async function resolveToken (instance, providerChain, token) {
  const c = cacheFor(instance)
  const key = String(providerChain)
  if (!c.tokensByChain.has(key)) {
    c.tokensByChain.set(key, await instance.getSupportedTokens({ fromChain: providerChain }))
  }
  const tokens = c.tokensByChain.get(key) || []

  const row = tokens.find((t) =>
    token.isNative
      ? t.symbol && t.symbol.toUpperCase() === token.symbol.toUpperCase()
      : t.address && token.address && t.address.toLowerCase() === token.address.toLowerCase()
  )

  // If the provider doesn't list the token, fall back to our address and let the
  // provider's own quote decide — this keeps us from being stricter than the
  // protocol (some accept tokens they don't enumerate in getSupportedTokens).
  return row ? row.token : token.address
}

/**
 * Rewrites a request's token/chain identifiers into the ones a protocol expects.
 * For self-describing (swidge) protocols the addresses/chains are translated via
 * the provider's own `getSupportedChains`/`getSupportedTokens`; for swap/bridge
 * protocols the request is returned unchanged (they take the contract address).
 *
 * @param {any} instance - The protocol instance.
 * @param {string} network - Our source network name.
 * @param {SwapRequest} request - The normalized request (tokens carry symbol/isNative).
 * @returns {Promise<SwapRequest>} The request with provider-specific identifiers.
 */
export async function resolveRequestIdentifiers (instance, network, request) {
  if (!selfDescribes(instance)) return request

  const fromChain = await resolveChain(instance, network)
  // request.toChain holds the destination network key (set by the action for a
  // cross-network route); resolve it to the provider's own chain id.
  const toChain = request.toChain !== undefined
    ? await resolveChain(instance, String(request.toChain))
    : undefined

  const fromToken = await resolveToken(instance, fromChain, /** @type {any} */ (request.fromToken))
  const toToken = await resolveToken(instance, toChain ?? fromChain, /** @type {any} */ (request.toToken))

  return {
    ...request,
    fromToken: { ...request.fromToken, address: fromToken },
    toToken: { ...request.toToken, address: toToken },
    toChain
  }
}
