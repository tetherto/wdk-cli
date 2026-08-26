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
import { configService } from './config-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('../config/wdk-config.js').WdkProtocolEntry} WdkProtocolEntry */
/** @typedef {'swap' | 'bridge' | 'swidge'} ProtocolKind */

/**
 * Returns all registered protocols, merging catalog protocols with any the
 * user added. Catalog entries win on name collision.
 *
 * @returns {Record<string, WdkProtocolEntry>} Protocol entries keyed by short name.
 */
export function getProtocols () {
  const custom = configService.get('customProtocols')
  const merged = (custom && typeof custom === 'object') ? { ...custom } : {}
  return { ...merged, ...(walletsFile.protocols || {}) }
}

/**
 * Looks up a protocol entry by short name.
 *
 * @param {string} name - The protocol short name (e.g. "velora").
 * @returns {WdkProtocolEntry} The protocol entry.
 * @throws {WdkCliError} When no protocol is registered under that name.
 */
export function getProtocol (name) {
  const protocol = getProtocols()[name]
  if (!protocol) {
    const names = Object.keys(getProtocols())
    throw new WdkCliError(
      `Unknown protocol '${name}'.`,
      ErrorCode.INVALID_ARGUMENT,
      names.length > 0 ? `Available protocols: ${names.join(', ')}` : 'No protocols are configured.'
    )
  }
  return protocol
}

/**
 * Resolves a protocol's effective config for a network: the protocol's general
 * `config` shallow-merged under any per-network override in
 * `networks.<network>.protocols.<name>`.
 *
 * @param {string} name - The protocol short name.
 * @param {string} network - The network name.
 * @returns {Record<string, unknown>} The merged config passed verbatim to the module.
 */
export function resolveProtocolConfig (name, network) {
  const root = getProtocol(name).config || {}
  const perNetwork = /** @type {Record<string, unknown> | undefined} */ (
    walletsFile.networks[network]?.protocols?.[name]
  ) || {}
  return { ...root, ...perNetwork }
}

/**
 * Detects a protocol's kind from the quote method its class exposes. A swidge
 * class also implements swap and bridge, so `quoteSwidge` is checked first.
 *
 * @param {{ prototype?: Record<string, unknown> }} ProtocolClass - The protocol class.
 * @returns {ProtocolKind | null} The detected kind, or null when none matches.
 */
export function detectKind (ProtocolClass) {
  const has = (method) => typeof ProtocolClass?.prototype?.[method] === 'function'
  if (has('quoteSwidge')) return 'swidge'
  if (has('quoteSwap')) return 'swap'
  if (has('quoteBridge')) return 'bridge'
  return null
}

/**
 * Whether a protocol of the given kind can serve a request of the given kind.
 * A swidge protocol serves both swap and bridge requests.
 *
 * @param {ProtocolKind} protocolKind - The protocol's detected kind.
 * @param {'swap' | 'bridge'} requestKind - The request's kind.
 * @returns {boolean} True when the protocol can serve the request.
 */
export function servesRequest (protocolKind, requestKind) {
  return protocolKind === 'swidge' || protocolKind === requestKind
}

/**
 * Dynamically imports a protocol module and returns its default-exported class.
 *
 * @param {string} module - The protocol module package name.
 * @returns {Promise<Function>} The protocol class (default export).
 * @throws {WdkCliError} When the module is not installed.
 */
export async function loadProtocolClass (module) {
  try {
    const mod = await import(module)
    return mod.default || mod
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'MODULE_NOT_FOUND') {
      throw new WdkCliError(
        `Protocol module '${module}' is not installed.`,
        ErrorCode.UNSUPPORTED_MODULE,
        `Install it with: wdk module add --name ${module}`
      )
    }
    throw err
  }
}
