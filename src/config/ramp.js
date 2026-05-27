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

import walletsFileRaw from '../../wdk.config.json' with { type: 'json' }
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('./networks.js').WdkConfigFile} WdkConfigFile */

/** @type {WdkConfigFile} */
const walletsFile = walletsFileRaw

/**
 * The identifier of a supported ramp provider.
 *
 * @typedef {'moonpay'} RampModule
 */

/**
 * @typedef {Object} ResolvedAsset
 * @property {string} code - The provider-canonical asset code (e.g. "usdt_arbitrum").
 * @property {string} token - The lowercase token alias.
 */

// MoonPay encodes network in its asset code (e.g. usdt_arbitrum), so per-
// network config is a flat token-alias → asset-code map.

const SUPPORTED_MODULES = Object.freeze(['moonpay'])

const moonpayConfigs = {}

for (const [name, entry] of Object.entries(walletsFile.networks)) {
  const ramp = entry.ramp
  if (ramp?.moonpay) moonpayConfigs[name] = ramp.moonpay
}

/**
 * Validates that the given module name is a supported ramp provider.
 *
 * @param {string} module - The provider name to validate.
 * @returns {RampModule} The validated module name.
 * @throws {WdkCliError} When the module is not supported.
 */
export function validateModule(module) {
  if (!SUPPORTED_MODULES.includes(module)) {
    throw new WdkCliError(
      `Unsupported module '${module}'. Available: ${SUPPORTED_MODULES.join(', ')}`,
      ErrorCode.UNSUPPORTED_MODULE
    )
  }
  return /** @type {RampModule} */ (module)
}

/**
 * Resolves a wdk token alias to a provider-canonical asset code for the given network.
 *
 * @param {string} network - The blockchain network name.
 * @param {string} token - The wdk token alias (case-insensitive).
 * @param {RampModule} module - The ramp provider module name.
 * @returns {ResolvedAsset} The resolved provider asset code and lowercase token.
 * @throws {WdkCliError} When the network or token is not supported by the module.
 */
export function resolveAsset(network, token, module) {
  const lower = token.toLowerCase()
  if (module === 'moonpay') {
    const assets = moonpayConfigs[network]
    if (!assets) {
      throw new WdkCliError(`Network '${network}' does not support moonpay.`, ErrorCode.NETWORK_NOT_SUPPORTED)
    }
    const code = assets[lower]
    if (!code) {
      const supported = Object.keys(assets).join(', ')
      throw new WdkCliError(
        `Token '${token}' on '${network}' is not supported by moonpay. Supported: ${supported}`,
        ErrorCode.TOKEN_NOT_SUPPORTED
      )
    }
    return { code, token: lower }
  }
  throw new WdkCliError(`Unsupported ramp module '${module}'.`, ErrorCode.UNSUPPORTED_MODULE)
}
