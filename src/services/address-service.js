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
  validateBitcoinAddress,
  validateEVMAddress,
  validateSolanaAddress,
  validateSparkAddress,
  validateTronAddress
} from '@tetherto/wdk-utils'

import { getChainId } from '../config/networks.js'
import { walletsFile } from '../config/wdk-config.js'
import { configService } from './config-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** Address validators by CAIP-2 chain namespace. */
const VALIDATORS = {
  bip122: validateBitcoinAddress,
  eip155: validateEVMAddress,
  solana: validateSolanaAddress,
  spark: validateSparkAddress,
  tron: validateTronAddress
}

/**
 * Returns the Bitcoin network label the wallet module is configured for,
 * translated to the validator's vocabulary (bitcoinjs calls mainnet "bitcoin").
 *
 * @param {string} network - The CLI network name.
 * @returns {string | undefined}
 */
function bitcoinNetworkLabel (network) {
  const raw = /** @type {string | undefined} */ (
    walletsFile.networks[network]?.config?.network ??
    configService.get(`customNetworks.${network}.config.network`)
  )
  return raw === 'bitcoin' ? 'mainnet' : raw
}

/**
 * @param {string} network
 * @param {string} reason
 * @returns {WdkCliError}
 */
function invalidAddress (network, reason) {
  return new WdkCliError(
    `Invalid recipient address for '${network}' (${reason}).`,
    ErrorCode.INVALID_ADDRESS,
    'Double-check the address and the selected --network.'
  )
}

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
  const namespace = getChainId(network).split(':')[0]
  const validate = VALIDATORS[namespace]
  if (!validate) return

  const result = validate(address)
  if (!result.success) {
    throw invalidAddress(network, /** @type {{ reason: string }} */ (result).reason)
  }

  // Bitcoin addresses encode their network; it must match the configured one.
  if (namespace === 'bip122') {
    const expected = bitcoinNetworkLabel(network)
    const actual = /** @type {{ network?: string }} */ (result).network
    if (expected && actual !== expected) {
      throw invalidAddress(network, `NETWORK_MISMATCH: ${actual} address`)
    }
  }
}
