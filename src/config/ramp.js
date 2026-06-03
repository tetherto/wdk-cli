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

import { getMoonpayCode, getTokensSupportedBy } from '../services/token-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

const SUPPORTED_MODULES = ['moonpay']

/**
 * @typedef {Object} ResolvedAsset
 * @property {string} code - The provider-canonical asset code.
 * @property {string} token - The lowercase token alias.
 */

/**
 * Validates that the given module name is a supported ramp provider.
 *
 * @param {string} module - The provider name to validate.
 * @returns {string} The validated module name.
 * @throws {WdkCliError} When the module is not supported.
 */
export function validateModule (module) {
  if (!SUPPORTED_MODULES.includes(module)) {
    throw new WdkCliError(
      `Unsupported module '${module}'. Available: ${SUPPORTED_MODULES.join(', ')}`,
      ErrorCode.UNSUPPORTED_MODULE
    )
  }
  return module
}

/**
 * Resolves a wdk token alias to a provider-canonical asset code for the given network.
 *
 * @param {string} network - The blockchain network name.
 * @param {string} token - The wdk token alias (case-insensitive).
 * @param {string} module - The ramp provider module name.
 * @returns {ResolvedAsset} The resolved provider asset code and lowercase token.
 * @throws {WdkCliError} When the network or token is not supported by the module.
 */
export function resolveAsset (network, token, module) {
  const lower = token.toLowerCase()
  if (module === 'moonpay') {
    const code = getMoonpayCode(network, lower)
    if (code) return { code, token: lower }

    const supported = getTokensSupportedBy(network, 'moonpay')
    if (supported.length === 0) {
      throw new WdkCliError(
        `Network '${network}' does not support moonpay.`,
        ErrorCode.NETWORK_NOT_SUPPORTED
      )
    }
    throw new WdkCliError(
      `Token '${token}' on '${network}' is not supported by moonpay. Supported: ${supported.join(', ')}`,
      ErrorCode.TOKEN_NOT_SUPPORTED
    )
  }
  throw new WdkCliError(`Unsupported ramp module '${module}'.`, ErrorCode.UNSUPPORTED_MODULE)
}
