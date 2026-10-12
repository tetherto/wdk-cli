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
  findProtocol,
  loadProtocolClass,
  resolveProtocolConfig
} from './protocol-service.js'
import { getInstalledVersion } from './module-service.js'
import { getTokenSlug, getTokenByName, getTokensSupportedBy } from './token-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {'buy' | 'sell'} Direction */

/**
 * @typedef {Object} ResolvedAssets
 * @property {string} cryptoCode - The provider's identifier for the crypto asset.
 * @property {number} cryptoDecimals - The number of decimals for the crypto asset.
 * @property {string} fiatCode - The provider's own spelling of the fiat currency code.
 * @property {number} fiatDecimals - The number of decimals for the fiat currency.
 */

/**
 * @typedef {Object} RampInput
 * @property {string} network - The blockchain network name.
 * @property {string} token - The CLI token name.
 * @property {string} walletAddress - The wallet address for receiving (buy) or refunding (sell).
 * @property {string} fiatCurrency - The fiat currency code as the user gave it (e.g. "usd").
 * @property {string} fiatCode - The provider's own spelling of that code, from its listing.
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
 * An entry from a provider's supported-asset or supported-currency listing.
 *
 * @typedef {Object} SupportedAsset
 * @property {string} code - The provider's identifier for the asset or currency.
 * @property {number} decimals - The number of decimal places its amounts use.
 * @property {string} [networkCode] - The provider's name for the network the asset lives on,
 *   when it lists the same code on more than one.
 */

/**
 * The part of the SDK's `FiatProtocol` contract this service calls.
 *
 * @typedef {Object} FiatProtocol
 * @property {(options: Record<string, unknown>) => Promise<QuoteResult>} quoteBuy - Prices a purchase.
 * @property {(options: Record<string, unknown>) => Promise<QuoteResult>} quoteSell - Prices a sale.
 * @property {(options: Record<string, unknown>) => Promise<{ buyUrl: string }>} buy - Builds the hosted buy URL.
 * @property {(options: Record<string, unknown>) => Promise<{ sellUrl: string }>} sell - Builds the hosted sell URL.
 * @property {() => Promise<SupportedAsset[]>} getSupportedCryptoAssets - Lists the crypto assets the provider carries.
 * @property {() => Promise<SupportedAsset[]>} getSupportedFiatCurrencies - Lists the fiat currencies the provider carries.
 */

/**
 * A fiat module's default-exported class, constructed with no account and a
 * provider-shaped config.
 *
 * @typedef {new (account: undefined, config: Record<string, unknown>) => FiatProtocol} FiatProtocolConstructor
 */

/** The registry kind an on/off-ramp provider declares. */
const FIAT = 'fiat'

/**
 * Constructed modules, keyed by provider and network, held with the class they
 * were built from so a reloaded module is never served from the cache.
 *
 * @type {Map<string, { ProtocolClass: FiatProtocolConstructor, protocol: FiatProtocol }>}
 */
const instances = new Map()

/**
 * Returns the config keys a provider's module takes as a function rather than a
 * value, as its registry entry declares them.
 *
 * @param {string} name - The provider short name.
 * @returns {string[]} The callback config keys.
 */
function endpointKeys (name) {
  const declared = findProtocol(name)?.endpointKeys
  return Array.isArray(declared) ? declared : []
}

/**
 * POSTs to a configured endpoint and returns what it answers with, for config
 * keys a module takes as a callback rather than a value.
 *
 * A string payload is sent as `{ urlForSignature }`, any other payload as the
 * body. A JSON object answer is returned as-is unless it carries `signedUrl`,
 * `url` or `widgetUrl`, which are unwrapped to the string a URL-minting
 * callback expects.
 *
 * @param {string} endpoint - The URL to POST to.
 * @param {unknown} payload - The value the module passed to the callback.
 * @returns {Promise<unknown>} The endpoint's answer.
 * @throws {WdkCliError} SIGN_FAILED when the endpoint is unreachable.
 * @throws {WdkCliError} SIGN_FAILED when it answers with a non-OK status.
 */
async function postToEndpoint (endpoint, payload) {
  const body = typeof payload === 'string' ? { urlForSignature: payload } : payload
  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new WdkCliError(
      `Cannot reach endpoint '${endpoint}': ${detail}`,
      ErrorCode.SIGN_FAILED,
      'Check the configured URL and that the server is reachable.'
    )
  }
  if (!response.ok) {
    const answer = await response.text().catch(() => '')
    let reason = answer
    try {
      const parsed = JSON.parse(answer)
      reason = parsed?.error ?? parsed?.message ?? answer
    } catch {}
    throw new WdkCliError(
      `Endpoint '${endpoint}' failed: ${response.status} ${response.statusText}` +
        (reason ? ` — ${reason}` : ''),
      ErrorCode.SIGN_FAILED
    )
  }
  const data = await response.json()
  if (typeof data === 'string') return data
  return data?.signedUrl ?? data?.url ?? data?.widgetUrl ?? data
}

/**
 * Builds the config a module is constructed with: the registry's merged config,
 * with every declared endpoint key turned from a stored URL into the function
 * the module calls. A key with no URL set is dropped, leaving the module's own
 * "callback not provided" fallback in effect.
 *
 * @param {string} name - The provider short name.
 * @param {string} network - The network name, for per-network config.
 * @returns {Record<string, unknown>} The config to construct the module with.
 */
export function buildModuleConfig (name, network) {
  const config = { ...resolveProtocolConfig(name, network) }
  for (const key of endpointKeys(name)) {
    const endpoint = config[key]
    if (typeof endpoint !== 'string' || !endpoint) {
      delete config[key]
      continue
    }
    config[key] = (/** @type {unknown} */ payload) => postToEndpoint(endpoint, payload)
  }
  return config
}

/**
 * Returns the provider's module instance, constructing it on first use and
 * caching it per network.
 *
 * @param {string} name - The provider short name.
 * @param {string} network - The network name.
 * @returns {Promise<FiatProtocol>} The constructed protocol.
 * @throws {WdkCliError} UNSUPPORTED_MODULE when the module is not registered or not installed.
 */
async function getRampProtocol (name, network) {
  const key = `${name}/${network}`
  const ProtocolClass = /** @type {FiatProtocolConstructor} */ (
    /** @type {unknown} */ (await loadProtocolClass(getProtocol(name).module))
  )
  const cached = instances.get(key)
  if (cached?.ProtocolClass === ProtocolClass) return cached.protocol

  const protocol = new ProtocolClass(undefined, buildModuleConfig(name, network))
  instances.set(key, { ProtocolClass, protocol })
  return protocol
}

/**
 * Returns the fiat providers the CLI can use: enabled, declaring `kind: "fiat"`,
 * and with their module installed.
 *
 * @returns {string[]} Provider short names, in packaged order.
 */
function getRampProviders () {
  return Object.entries(getProtocols())
    .filter(([, entry]) => entry.kind === FIAT && getInstalledVersion(entry.module) !== null)
    .map(([name]) => name)
}

/**
 * Returns the fiat provider to use: the requested one, or the only usable one
 * when none is named.
 *
 * @param {string} [requested] - The provider short name from `--provider`.
 * @returns {string} The provider short name.
 * @throws {WdkCliError} INVALID_ARGUMENT when the named provider is not a fiat on/off-ramp.
 * @throws {WdkCliError} UNSUPPORTED_MODULE when the named provider's module is not installed.
 * @throws {WdkCliError} MISSING_CONFIG when no fiat provider is usable.
 * @throws {WdkCliError} INVALID_ARGUMENT when several are usable and none was named.
 */
export function resolveRampProvider (requested) {
  if (requested) {
    const entry = getProtocol(requested)
    if (entry.kind !== FIAT) {
      throw new WdkCliError(
        `Provider '${requested}' is not a fiat on/off-ramp.`,
        ErrorCode.INVALID_ARGUMENT,
        `It is a ${entry.kind} provider.`
      )
    }
    if (getInstalledVersion(entry.module) === null) {
      throw new WdkCliError(
        `Provider '${requested}' is not installed.`,
        ErrorCode.UNSUPPORTED_MODULE,
        `Install it with: wdk module add --name ${entry.module}`
      )
    }
    return requested
  }

  const usable = getRampProviders()
  if (usable.length === 0) {
    throw new WdkCliError(
      'No fiat provider is available.',
      ErrorCode.MISSING_CONFIG,
      'See the registered providers with: wdk provider list'
    )
  }
  if (usable.length > 1) {
    throw new WdkCliError(
      `Several fiat providers are available: ${usable.join(', ')}.`,
      ErrorCode.INVALID_ARGUMENT,
      `Choose one with: --provider ${usable[0]}`
    )
  }
  return usable[0]
}

/**
 * Returns the provider's identifier for a token, with any extra fields its API
 * takes alongside it.
 *
 * @param {string} provider - The provider short name.
 * @param {string} network - The network name.
 * @param {string} token - The CLI token name.
 * @returns {{ code: string, extras: Record<string, unknown> }} The identifier and its call extras.
 * @throws {WdkCliError} TOKEN_NOT_SUPPORTED when the token is not registered.
 * @throws {WdkCliError} TOKEN_NOT_SUPPORTED when the token has no mapping for this provider.
 */
function slugFor (provider, network, token) {
  const lower = token.toLowerCase()
  const mapping = getTokenSlug(network, lower, provider)

  if (mapping === undefined) {
    if (!getTokenByName(network, lower)) {
      throw new WdkCliError(
        `Unknown token '${token}' on '${network}'.`,
        ErrorCode.TOKEN_NOT_SUPPORTED,
        `See registered tokens with: wdk token list --network ${network}`
      )
    }
    const supported = getTokensSupportedBy(network, provider)
    const add = `Add one with: wdk config set --key overrides.tokens.${network}/${lower}.metadata.slugs.${provider} --value '<code>'`
    throw new WdkCliError(
      `Token '${lower}' on '${network}' has no ${provider} mapping.`,
      ErrorCode.TOKEN_NOT_SUPPORTED,
      supported.length > 0
        ? `${add}\nTokens ${provider} already supports on ${network}: ${supported.join(', ')}`
        : add
    )
  }

  if (typeof mapping === 'string') return { code: mapping, extras: {} }
  const { slug, ...extras } = mapping
  return { code: slug, extras }
}

/**
 * Picks the listing row the module itself will use for a token. A provider may
 * list the same code on several networks, each with its own decimals.
 *
 * @param {string} provider - The provider short name.
 * @param {SupportedAsset[]} assets - The provider's crypto listing.
 * @param {string} code - The provider's identifier for the token.
 * @param {Record<string, unknown>} extras - The mapping's extra fields, which may carry `network`.
 * @param {string} network - The CLI network name, for error messages.
 * @param {string} token - The CLI token name, for error messages.
 * @returns {SupportedAsset} The matching row.
 * @throws {WdkCliError} TOKEN_NOT_SUPPORTED when the provider does not list the code.
 * @throws {WdkCliError} TOKEN_NOT_SUPPORTED when the code is ambiguous and the mapping names no network.
 */
function pickAsset (provider, assets, code, extras, network, token) {
  const candidates = assets.filter((a) => a.code === code)
  const fix = `Check it with: wdk token info --network ${network} --token ${token}`

  if (candidates.length === 0) {
    throw new WdkCliError(
      `Asset '${code}' is not supported by ${provider}.`,
      ErrorCode.TOKEN_NOT_SUPPORTED,
      `The token's ${provider} slug may be wrong. ${fix}`
    )
  }
  if (candidates.length === 1) return candidates[0]

  const wanted = extras.network
  if (typeof wanted !== 'string' || !wanted) {
    throw new WdkCliError(
      `${provider} lists '${code}' on ${candidates.length} networks, so the mapping must name one.`,
      ErrorCode.TOKEN_NOT_SUPPORTED,
      `Set it with: wdk config set --key overrides.tokens.${network}/${token}.metadata.slugs.${provider} ` +
        `--value '{"slug":"${code}","network":"<one of: ${candidates.map((c) => c.networkCode).join(', ')}>"}'`
    )
  }
  const picked = candidates.find((a) => a.networkCode === wanted)
  if (!picked) {
    throw new WdkCliError(
      `${provider} does not list '${code}' on network '${wanted}'.`,
      ErrorCode.TOKEN_NOT_SUPPORTED,
      `It lists it on: ${candidates.map((c) => c.networkCode).join(', ')}. ${fix}`
    )
  }
  return picked
}

/**
 * Resolves the provider's asset code and the decimals of both sides from its
 * own listings. Currency codes are matched case-insensitively.
 *
 * @param {string} provider - The provider short name.
 * @param {string} network - The network name.
 * @param {string} token - The CLI token name.
 * @param {string} fiatCurrency - The fiat currency code.
 * @returns {Promise<ResolvedAssets>} The resolved codes and decimals.
 * @throws {WdkCliError} TOKEN_NOT_SUPPORTED when the provider does not carry the asset.
 * @throws {WdkCliError} INVALID_ARGUMENT when the provider does not carry the currency.
 */
export async function resolveAssets (provider, network, token, fiatCurrency) {
  const protocol = await getRampProtocol(provider, network)
  const { code, extras } = slugFor(provider, network, token)
  const [cryptos, fiats] = await Promise.all([
    protocol.getSupportedCryptoAssets(),
    protocol.getSupportedFiatCurrencies()
  ])

  const crypto = pickAsset(provider, cryptos, code, extras, network, token)
  const wanted = fiatCurrency.toLowerCase()
  const fiat = fiats.find((f) => f.code.toLowerCase() === wanted)
  if (!fiat) {
    throw new WdkCliError(
      `Fiat currency '${fiatCurrency}' is not supported by ${provider}.`,
      ErrorCode.INVALID_ARGUMENT,
      `Currencies ${provider} supports: ${fiats.map((f) => f.code).sort().join(', ')}`
    )
  }
  return {
    cryptoCode: code,
    cryptoDecimals: crypto.decimals,
    fiatCode: fiat.code,
    fiatDecimals: fiat.decimals
  }
}

/**
 * Translates a ramp request into the option object `FiatProtocol` expects.
 *
 * @param {string} provider - The provider short name.
 * @param {RampInput} input - The ramp input.
 * @returns {Record<string, unknown>} The options common to every quote and URL call.
 * @throws {WdkCliError} TOKEN_NOT_SUPPORTED when the token has no mapping for this provider.
 */
function buildRampOptions (provider, input) {
  const { code, extras } = slugFor(provider, input.network, input.token)
  const amount = input.fiatAmount !== undefined
    ? { fiatAmount: input.fiatAmount }
    : { cryptoAmount: input.cryptoAmount }

  return {
    cryptoAsset: code,
    fiatCurrency: input.fiatCode,
    ...amount,
    ...(Object.keys(extras).length > 0 && { config: extras })
  }
}

/**
 * @typedef {Object} QuoteAttempt
 * @property {QuoteResult} [quote] - The quote, when the provider priced the pair.
 * @property {string} [reason] - Why the provider could not price it, otherwise.
 */

/**
 * Asks the provider for a quote. A provider that cannot price the pair reports
 * why rather than answering nothing; a rejected credential is raised.
 *
 * @param {string} provider - The provider short name.
 * @param {RampInput} input - The ramp input.
 * @param {Direction} direction - The ramp direction.
 * @returns {Promise<QuoteAttempt>} The quote, or the reason there is none.
 * @throws {WdkCliError} INVALID_CONFIG when the provider rejected the credentials.
 */
export async function quoteRamp (provider, input, direction) {
  const protocol = await getRampProtocol(provider, input.network)
  const options = buildRampOptions(provider, input)
  try {
    const quote = direction === 'buy'
      ? await protocol.quoteBuy(options)
      : await protocol.quoteSell(options)
    return { quote }
  } catch (error) {
    if (error instanceof WdkCliError) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/unauthor|forbidden|api key|invalid key/i.test(message)) {
      throw new WdkCliError(
        `${provider} rejected the request: ${message}`,
        ErrorCode.INVALID_CONFIG,
        `Check its credentials with: wdk provider info --name ${provider}`
      )
    }
    return { reason: message }
  }
}

/**
 * Builds the hosted widget URL for the requested direction.
 *
 * @param {string} provider - The provider short name.
 * @param {RampInput} input - The ramp input.
 * @param {Direction} direction - The ramp direction.
 * @returns {Promise<UrlResult>} The widget URL.
 * @throws {WdkCliError} SIGN_FAILED when the configured signing endpoint fails.
 */
export async function buildRampUrl (provider, input, direction) {
  const protocol = await getRampProtocol(provider, input.network)
  const options = buildRampOptions(provider, input)
  if (direction === 'buy') {
    const { buyUrl } = await protocol.buy({ ...options, recipient: input.walletAddress })
    return { url: buyUrl }
  }
  const { sellUrl } = await protocol.sell({ ...options, refundAddress: input.walletAddress })
  return { url: sellUrl }
}
