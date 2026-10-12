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

import { daemonClient } from '../daemon/client.js'
import { validateNetwork } from '../config/networks.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/**
 * Validates that a message is a non-empty string.
 *
 * @param {string} message - The message to validate.
 * @returns {void}
 * @throws {WdkCliError} INVALID_ARGUMENT when the message is empty.
 */
function validateMessage (message) {
  if (typeof message !== 'string' || message === '') {
    throw new WdkCliError('Message must be a non-empty string.', ErrorCode.INVALID_ARGUMENT)
  }
}

/**
 * @typedef {Object} SignMessageInput
 * @property {string} network - The blockchain network name (e.g. "ethereum", "bitcoin").
 * @property {string} message - The message to sign.
 * @property {number} index - The BIP-44 account index.
 * @property {string} [wallet] - The wallet name (defaults to the active wallet).
 */

/**
 * @typedef {Object} SignMessageResult
 * @property {string} network - The blockchain network name.
 * @property {number} index - The BIP-44 account index.
 * @property {string} address - The signing account address.
 * @property {string} message - The signed message.
 * @property {string} signature - The produced signature.
 */

/**
 * Signs an arbitrary message with the account's private key.
 *
 * @param {SignMessageInput} input - The signing parameters.
 * @returns {Promise<SignMessageResult>} The signature and signing address.
 * @throws {WdkCliError} When the message is empty, the network is not
 *   supported, or the wallet is not unlocked.
 */
export async function signMessage (input) {
  const wallet = await daemonClient.requireUnlocked(input.wallet)
  validateNetwork(input.network)
  validateMessage(input.message)
  const { address, signature } = await daemonClient.signMessage(
    input.network,
    input.message,
    input.index,
    wallet
  )
  return {
    network: input.network,
    index: input.index,
    address,
    message: input.message,
    signature
  }
}

/**
 * @typedef {Object} VerifyMessageInput
 * @property {string} network - The blockchain network name (e.g. "ethereum", "bitcoin").
 * @property {string} message - The signed message.
 * @property {string} signature - The signature to check.
 * @property {number} index - The BIP-44 account index.
 * @property {string} [wallet] - The wallet name (defaults to the active wallet).
 */

/**
 * @typedef {Object} VerifyMessageResult
 * @property {string} network - The blockchain network name.
 * @property {number} index - The BIP-44 account index.
 * @property {string} message - The checked message.
 * @property {string} signature - The checked signature.
 * @property {string} address - The account whose key the signature was checked against.
 * @property {boolean} valid - Whether the signature is valid for the account's key.
 */

/**
 * Verifies a message signature against the account's key.
 *
 * @param {VerifyMessageInput} input - The verification parameters.
 * @returns {Promise<VerifyMessageResult>} The verification outcome.
 * @throws {WdkCliError} When the message or signature is empty, the network
 *   is not supported, or the wallet is not unlocked.
 */
export async function verifyMessage (input) {
  const wallet = await daemonClient.requireUnlocked(input.wallet)
  validateNetwork(input.network)
  validateMessage(input.message)
  if (typeof input.signature !== 'string' || input.signature === '') {
    throw new WdkCliError('Signature must be a non-empty string.', ErrorCode.INVALID_ARGUMENT)
  }
  const { valid, address } = await daemonClient.verifyMessage(
    input.network,
    input.message,
    input.signature,
    input.index,
    wallet
  )
  return {
    network: input.network,
    index: input.index,
    message: input.message,
    signature: input.signature,
    address,
    valid
  }
}
