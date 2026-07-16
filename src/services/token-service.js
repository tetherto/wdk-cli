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

import WdkBaseAssetRegistry, { TokenAssetSchema } from '@tetherto/wdk-asset-registry'

import { tokensFile } from '../config/wdk-tokens.js'
import { walletsFile } from '../config/wdk-config.js'
import { configService } from './config-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { humanToBaseUnits } from '../ui/parsers.js'

/** @typedef {import('../config/wdk-tokens.js').TokenMetadata} TokenMetadata */
/** @typedef {import('../config/wdk-tokens.js').CliTokenAsset} CliTokenAsset */

/**
 * A single token entry as consumed by CLI commands and services. Tokens are
 * addressed by network name plus lower-case token key (`--token <token>`).
 *
 * @typedef {Object} TokenEntry
 * @property {string} symbol - The display symbol (e.g. "USDT", "ETH").
 * @property {number} decimals - The number of decimal places.
 * @property {boolean} isNative - True when this token is the chain's native asset (use native transfer path).
 * @property {string} [address] - Contract/mint address. Required for non-native sends; optional for native (wrapped/protocol representation).
 * @property {TokenMetadata} [metadata] - Optional provider-specific mappings.
 */

/**
 * Token asset registry that keeps the CLI-specific extra fields (`network`,
 * `slug`, `testnet`, `metadata`), following the wdk-asset-registry guidance
 * that consumers needing extra fields define their own registry subclass.
 * Assets are validated against the token schema and stored as provided. The
 * schema requires `address`, so native assets (which have none) are validated
 * with an empty-string placeholder that is never stored or returned.
 *
 * @extends {WdkBaseAssetRegistry<CliTokenAsset>}
 */
class CliTokenAssetRegistry extends WdkBaseAssetRegistry {
  /**
   * @protected
   * @param {CliTokenAsset} asset - Asset definition to validate.
   * @returns {CliTokenAsset} The validated asset, extra fields included.
   */
  _assertAsset (asset) {
    TokenAssetSchema.parse(asset.address === undefined ? { ...asset, address: '' } : asset)
    return { ...asset }
  }
}

/** Built-in asset ids (`<network>/<slug>`), for source checks. */
const BUILTIN_IDS = new Set(tokensFile.assets.map((a) => a.id))

/** Built-in network names in assets-file order, for stable listing. */
const BUILTIN_NETWORKS = [...new Set(tokensFile.assets.map((a) => a.network))]

/**
 * Returns the CAIP-2 chain id for a network: from `wdk.config.json` for
 * built-in networks, from the custom network config otherwise, falling back
 * to a synthetic `wdk:<network>` id so legacy custom networks keep working.
 *
 * @param {string} network
 * @returns {string}
 */
function chainIdFor (network) {
  return (
    walletsFile.networks[network]?.chainId ??
    /** @type {string | undefined} */ (configService.get(`customNetworks.${network}.chainId`)) ??
    `wdk:${network}`
  )
}

/**
 * Converts a stored custom token entry into a registry asset.
 *
 * @param {string} network
 * @param {string} slug - Lower-case token key.
 * @param {TokenEntry} entry
 * @returns {CliTokenAsset}
 */
function customEntryToAsset (network, slug, entry) {
  return {
    id: `${network}/${slug}`,
    chainId: chainIdFor(network),
    network,
    slug,
    symbol: entry.symbol,
    name: entry.symbol,
    decimals: entry.decimals,
    isNative: entry.isNative,
    ...(entry.address !== undefined && { address: entry.address }),
    testnet: walletsFile.networks[network]?.testnet ?? false,
    ...(entry.metadata !== undefined && { metadata: entry.metadata })
  }
}

/**
 * Maps a registry asset back to the CLI's `TokenEntry` shape, so command
 * output stays independent of registry-internal fields.
 *
 * @param {CliTokenAsset} asset
 * @returns {TokenEntry}
 */
function toTokenEntry (asset) {
  return {
    symbol: asset.symbol,
    decimals: asset.decimals,
    isNative: asset.isNative,
    ...(asset.address !== undefined && { address: asset.address }),
    ...(asset.metadata !== undefined && { metadata: asset.metadata })
  }
}

/** @type {CliTokenAssetRegistry | null} */
let cachedRegistry = null
/** @type {string | null} */
let cachedCustomSnapshot = null

/**
 * Returns the token registry with built-in assets plus the user's custom
 * tokens from config (custom entries override built-in ones by id). The
 * registry is rebuilt whenever the persisted custom tokens change, so
 * long-running processes (daemon) observe `wdk token add/remove` live.
 *
 * @returns {CliTokenAssetRegistry}
 */
function getRegistry () {
  const custom = /** @type {Record<string, Record<string, TokenEntry>> | undefined} */ (
    configService.get('customTokens')
  )
  const snapshot = custom === undefined ? '' : JSON.stringify(custom)
  if (cachedRegistry && snapshot === cachedCustomSnapshot) return cachedRegistry

  const registry = new CliTokenAssetRegistry(tokensFile.assets)
  if (custom) {
    for (const [network, entries] of Object.entries(custom)) {
      for (const [slug, entry] of Object.entries(entries)) {
        registry.registerAsset(customEntryToAsset(network, slug, entry), true)
      }
    }
  }
  cachedRegistry = registry
  cachedCustomSnapshot = snapshot
  return registry
}

/**
 * Returns all assets registered for a network, built-in and custom merged.
 *
 * @param {string} network
 * @returns {CliTokenAsset[]}
 */
function assetsForNetwork (network) {
  return getRegistry().getAsset([{ network }])
}

/**
 * Resolves a token by its registry token (case-insensitive).
 *
 * @param {string} network - The network name.
 * @param {string} token - The token (e.g. "usdt").
 * @returns {TokenEntry | undefined} The token entry, or undefined if not registered.
 */
export function getTokenByName (network, token) {
  const asset = getRegistry().getAssetById(`${network}/${token.toLowerCase()}`)
  return asset ? toTokenEntry(asset) : undefined
}

/**
 * Resolves a token by contract address on a given network. EVM addresses are
 * matched case-insensitively; non-EVM addresses are matched exactly.
 *
 * @param {string} network - The network name.
 * @param {string} address - The contract / mint address.
 * @returns {TokenEntry | undefined} The token entry, or undefined if no match.
 */
export function getTokenByAddress (network, address) {
  const caseSensitive = !address.startsWith('0x')
  const [asset] = getRegistry().getAsset([{ network, address }], { caseSensitive })
  return asset ? toTokenEntry(asset) : undefined
}

/**
 * Returns all tokens (built-in + custom merged) for the given network.
 *
 * @param {string} network - The network name.
 * @returns {Record<string, TokenEntry>} Token entries keyed by token.
 */
export function getTokensForNetwork (network) {
  return Object.fromEntries(assetsForNetwork(network).map((a) => [a.slug, toTokenEntry(a)]))
}

/**
 * Returns the indexer slug (`metadata.indexerSlug`) for the given token, or
 * undefined when the token isn't registered or has no indexer mapping.
 *
 * @param {string} network
 * @param {string} token
 * @returns {string | undefined}
 */
export function getIndexerCode (network, token) {
  return getTokenByName(network, token)?.metadata?.indexerSlug
}

/**
 * Returns the MoonPay asset slug (`metadata.moonpaySlug`) for the given token,
 * or undefined when the token isn't registered or has no MoonPay mapping.
 *
 * @param {string} network
 * @param {string} token
 * @returns {string | undefined}
 */
export function getMoonpayCode (network, token) {
  return getTokenByName(network, token)?.metadata?.moonpaySlug
}

/**
 * Returns the Bitfinex pair slug (`metadata.bitfinexSlug`) for the given token,
 * or undefined when the token isn't registered or has no Bitfinex mapping.
 *
 * @param {string} network
 * @param {string} token
 * @returns {string | undefined}
 */
export function getBitfinexCode (network, token) {
  return getTokenByName(network, token)?.metadata?.bitfinexSlug
}

/**
 * Returns the list of token names on a network that have a mapping for the
 * given provider in their `metadata` block.
 *
 * @param {string} network
 * @param {'indexerSlug' | 'moonpaySlug' | 'bitfinexSlug'} provider
 * @returns {string[]} Token names (lowercase keys from the registry).
 */
export function getTokensSupportedBy (network, provider) {
  return assetsForNetwork(network)
    .filter((a) => a.metadata && typeof a.metadata[provider] === 'string')
    .map((a) => a.slug)
}

/**
 * Returns the native token entry for the given network, or undefined if none
 * is marked `isNative: true`.
 *
 * @param {string} network - The network name.
 * @returns {TokenEntry | undefined}
 */
export function getNativeToken (network) {
  const [asset] = getRegistry().getAsset([{ network, isNative: true }])
  return asset ? toTokenEntry(asset) : undefined
}

/**
 * Returns the full token registry (all networks, built-in + custom merged).
 *
 * @returns {Record<string, Record<string, TokenEntry>>}
 */
export function getAllTokens () {
  /** @type {Record<string, Record<string, TokenEntry>>} */
  const result = {}
  for (const network of BUILTIN_NETWORKS) {
    result[network] = getTokensForNetwork(network)
  }
  const customAll = /** @type {Record<string, Record<string, TokenEntry>> | undefined} */ (
    configService.get('customTokens')
  )
  if (customAll) {
    for (const network of Object.keys(customAll)) {
      if (!result[network]) result[network] = getTokensForNetwork(network)
    }
  }
  return result
}

/**
 * Returns true when the token is defined as a built-in entry for the network.
 *
 * @param {string} network
 * @param {string} token
 * @returns {boolean}
 */
export function isBuiltinToken (network, token) {
  return BUILTIN_IDS.has(`${network}/${token.toLowerCase()}`)
}

/**
 * Returns the effective source of a token entry: `'custom'` when overridden or
 * added via `wdk token add`, `'built-in'` when only defined in `wdk.tokens.json`,
 * or `undefined` when not registered.
 *
 * @param {string} network
 * @param {string} token
 * @returns {'built-in' | 'custom' | undefined}
 */
export function getTokenSource (network, token) {
  const lower = token.toLowerCase()
  const custom = configService.get(`customTokens.${network}.${lower}`)
  if (custom !== undefined) return 'custom'
  if (BUILTIN_IDS.has(`${network}/${lower}`)) return 'built-in'
  return undefined
}

/**
 * @typedef {Object} ResolvedTokenIdentifier
 * @property {boolean} isNative - True when the token is the chain's native asset.
 *   Callers should route to the native send/balance path and ignore `address`.
 * @property {string} [address] - Contract address for non-native tokens.
 *   Always present for non-native; may also be present for native (wrapped representation).
 */

/**
 * Resolves a user-provided `--token` value against the registry, returning both
 * the contract address and whether the token is the chain's native asset.
 * The token must be registered — no raw-address fallback. Native tokens are
 * accepted: callers branch on `isNative` to choose the right downstream path.
 *
 * @param {string} network
 * @param {string} token - The user-supplied token name (e.g. "usdt", "eth").
 * @returns {ResolvedTokenIdentifier}
 * @throws {WdkCliError} When the token is not registered, or when a non-native
 *   token entry has no contract address (e.g. indexer-only entry).
 */
export function resolveTokenIdentifier (network, token) {
  const hit = getTokenByName(network, token)
  if (!hit) {
    throw new WdkCliError(
      `Token '${token}' is not registered on '${network}'.`,
      ErrorCode.TOKEN_NOT_SUPPORTED,
      `Run \`wdk token list --network ${network}\` to see the available tokens.`
    )
  }
  if (!hit.isNative && !hit.address) {
    throw new WdkCliError(
      `Token '${token}' on '${network}' has no contract address registered.`,
      ErrorCode.TOKEN_NOT_SUPPORTED
    )
  }
  return { isNative: hit.isNative, address: hit.address }
}

/**
 * Writes a custom token entry under `customTokens.<network>.<token>`.
 * The caller is responsible for validating `entry` before calling.
 *
 * @param {string} network
 * @param {string} token
 * @param {TokenEntry} entry
 * @returns {void}
 */
export function saveCustomToken (network, token, entry) {
  configService.set(`customTokens.${network}.${token.toLowerCase()}`, entry)
}

/**
 * Deletes a custom token entry. Returns false when no custom entry exists.
 *
 * @param {string} network
 * @param {string} token
 * @returns {boolean} True if a custom entry was deleted; false otherwise.
 */
export function deleteCustomToken (network, token) {
  const key = `customTokens.${network}.${token.toLowerCase()}`
  if (configService.get(key) === undefined) return false
  configService.delete(key)
  return true
}

/**
 * Converts a human-readable decimal amount to base units, using the registered
 * decimals of the given token (or the native token when `token` is omitted).
 *
 * @param {string} network
 * @param {string | undefined} token - Token name; omit for native.
 * @param {string} decimalAmount - Decimal string (e.g. "1.5").
 * @returns {string} The base-unit amount as a string (suitable for BigInt).
 * @throws {WdkCliError} When the token has no registered decimals, when the
 *   decimal value is malformed, or when it has more precision than the token allows.
 */
export function toBaseUnits (network, token, decimalAmount) {
  let decimals
  let label
  if (token) {
    const entry = getTokenByName(network, token)
    decimals = entry?.decimals
    label = token
  } else {
    const native = getNativeToken(network)
    decimals = native?.decimals
    label = native?.symbol ?? 'native'
  }
  if (typeof decimals !== 'number') {
    throw new WdkCliError(
      `Cannot determine decimals for '${label}' on '${network}'.`,
      ErrorCode.TOKEN_NOT_SUPPORTED
    )
  }
  return humanToBaseUnits(decimalAmount, decimals, label)
}
