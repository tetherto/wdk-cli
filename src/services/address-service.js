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

import { validateAddress } from '@tetherto/wdk-utils'

import { getChainId } from '../config/networks.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/**
 * Validates a recipient address against the network's address format, so
 * malformed addresses fail fast — before any daemon or RPC call. Networks
 * whose chain namespace has no validator are skipped; the wallet module
 * remains the final check.
 *
 * @param {string} network - The network name.
 * @param {string} address - The recipient address.
 * @returns {void}
 * @throws {WdkCliError} INVALID_ADDRESS when the address fails validation.
 */
export function validateRecipient (network, address) {
  const result = validateAddress(getChainId(network), address)

  if (result.success === false && result.reason !== 'UNSUPPORTED_CHAIN') {
    throw new WdkCliError(
      `Invalid recipient address for '${network}' (${result.reason}).`,
      ErrorCode.INVALID_ADDRESS,
      'Double-check the address and the selected --network.'
    )
  }
}
