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

import { PricingProvider, PricingClient } from '@tetherto/wdk-pricing-provider'
import {
  getProtocols,
  loadProtocolClass,
  resolveProtocolConfig,
  resolveSoleProvider
} from '../protocol-service.js'
import { getInstalledVersion } from '../module-service.js'
import { WdkCliError, ErrorCode } from '../../errors/index.js'

/** @typedef {import('@tetherto/wdk-pricing-provider').PricingProvider} Pricing */

/** The registry kind a USD price feed declares. */
export const PRICING = 'pricing'

/** How long a fetched price stays fresh; the package would otherwise cache for an hour. */
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * A resolved price feed.
 *
 * @typedef {Object} ResolvedPricing
 * @property {string} name - The provider short name, which is also its `metadata.slugs` key.
 * @property {Pricing} provider - The SDK wrapper around the provider's client.
 */

/**
 * The provider built for each name, keyed on the class it was built from so a
 * reinstalled or swapped module is not served a stale instance.
 *
 * @type {Map<string, { ClientClass: Function, resolved: ResolvedPricing }>}
 */
const instances = new Map()

/**
 * Returns the pricing provider to use, constructing it on first use. Pricing
 * providers cannot be added, so the usable one is whichever of the packaged
 * feeds is enabled.
 *
 * @returns {Promise<ResolvedPricing>} The resolved feed.
 * @throws {WdkCliError} MISSING_CONFIG when no pricing provider is available.
 * @throws {WdkCliError} INVALID_ARGUMENT when several are enabled at once.
 * @throws {WdkCliError} UNSUPPORTED_MODULE when the module exports no pricing client.
 */
export async function resolvePricingProvider () {
  const name = resolveSoleProvider(PRICING, 'price feed', (e) => getInstalledVersion(e.module) !== null)
  const module = getProtocols()[name].module
  const ClientClass = clientClass(await loadProtocolClass(module), name)

  const cached = instances.get(name)
  if (cached?.ClientClass === ClientClass) return cached.resolved

  const provider = /** @type {Pricing} */ (new PricingProvider({
    client: new ClientClass(resolveProtocolConfig(name)),
    priceCacheDurationMs: CACHE_TTL_MS
  }))
  const resolved = { name, provider }
  instances.set(name, { ClientClass, resolved })
  return resolved
}

/**
 * Returns the client class from a loaded pricing module. Protocol modules
 * default-export their class, so `loadProtocolClass` hands those back directly;
 * the pricing clients use a named export, so it hands back the namespace and
 * the class is the export extending {@link PricingClient}.
 *
 * @param {unknown} mod - What the loader returned.
 * @param {string} name - The provider short name, for the error message.
 * @returns {new (config: Record<string, unknown>) => PricingClient} The client class.
 * @throws {WdkCliError} UNSUPPORTED_MODULE when no pricing client can be identified.
 */
export function clientClass (mod, name) {
  /** @param {unknown} v */
  const cast = (v) => /** @type {new (config: Record<string, unknown>) => PricingClient} */ (v)
  /** @param {unknown} v */
  const extendsBase = (v) => typeof v === 'function' && v.prototype instanceof PricingClient

  if (extendsBase(mod)) return cast(mod)

  const clients = Object.values(/** @type {Record<string, unknown>} */ (mod)).filter(extendsBase)
  if (clients.length === 1) return cast(clients[0])

  throw new WdkCliError(
    `Provider '${name}' does not export a pricing client.`,
    ErrorCode.UNSUPPORTED_MODULE,
    clients.length > 1
      ? 'Its module exports several; a pricing module must export exactly one.'
      : 'A pricing module must export a class extending PricingClient.'
  )
}
