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

import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('./protocol-service.js').ProtocolKind} ProtocolKind */
/** @typedef {{ tokenIn: string, tokenOut: string, to?: string, tokenInAmount?: bigint, tokenOutAmount?: bigint }} SwapOptions */
/** @typedef {{ token: string, targetChain?: string | number, amount?: bigint, recipient?: string }} BridgeOptions */
/** @typedef {{ fromToken: string, toToken: string, toChain?: string | number, recipient?: string, fromTokenAmount?: bigint, toTokenAmount?: bigint }} SwidgeOptions */

/**
 * @typedef {{ address: string, decimals: number, symbol?: string, isNative?: boolean }} SwapRequestToken
 *
 * @typedef {Object} SwapRequest
 * @property {SwapRequestToken} fromToken - The resolved source token.
 * @property {SwapRequestToken} toToken - The resolved destination token.
 * @property {string | number} [toChain] - The destination chain identifier; omit for same-chain.
 * @property {string} [toNetwork] - Destination network name, when cross-network (for identifier resolution).
 * @property {bigint} [amountIn] - Exact input amount in base units (mutually exclusive with amountOut).
 * @property {bigint} [amountOut] - Exact output amount in base units (mutually exclusive with amountIn).
 * @property {string} [recipient] - The address that receives the output.
 */

/**
 * Builds the option object for a swap-kind protocol (`quoteSwap` / `swap`).
 *
 * @param {SwapRequest} req - The normalized request.
 * @returns {SwapOptions} The swap options.
 */
function buildSwapOptions (req) {
  /** @type {SwapOptions} */
  const options = { tokenIn: req.fromToken.address, tokenOut: req.toToken.address }
  if (req.recipient) options.to = req.recipient
  if (req.amountIn !== undefined) options.tokenInAmount = req.amountIn
  else options.tokenOutAmount = req.amountOut
  return options
}

/**
 * Builds the option object for a bridge-kind protocol (`quoteBridge` / `bridge`).
 * Bridge is same-token and exact-in only.
 *
 * @param {SwapRequest} req - The normalized request.
 * @returns {BridgeOptions} The bridge options.
 */
function buildBridgeOptions (req) {
  return {
    token: req.fromToken.address,
    targetChain: req.toChain,
    amount: req.amountIn,
    recipient: req.recipient
  }
}

/**
 * Builds the option object for a swidge-kind protocol (`quoteSwidge` / `swidge`).
 *
 * @param {SwapRequest} req - The normalized request.
 * @returns {SwidgeOptions} The swidge options.
 */
function buildSwidgeOptions (req) {
  /** @type {SwidgeOptions} */
  const options = { fromToken: req.fromToken.address, toToken: req.toToken.address }
  if (req.toChain !== undefined) options.toChain = req.toChain
  if (req.recipient) options.recipient = req.recipient
  if (req.amountIn !== undefined) options.fromTokenAmount = req.amountIn
  else options.toTokenAmount = req.amountOut
  return options
}

/**
 * Translates a normalized request into the option object a protocol of the
 * given kind expects. Each kind names the same concepts differently.
 *
 * @param {ProtocolKind} kind - The protocol kind.
 * @param {SwapRequest} req - The normalized request.
 * @returns {SwapOptions | BridgeOptions | SwidgeOptions} The kind-specific options.
 * @throws {WdkCliError} When the kind cannot serve the request shape.
 */
export function buildOptions (kind, req) {
  switch (kind) {
    case 'swap':
      return buildSwapOptions(req)
    case 'bridge':
      if (req.amountOut !== undefined) {
        throw new WdkCliError(
          'Bridge does not support --amount-out.',
          ErrorCode.INVALID_ARGUMENT,
          'Use --amount-in, or a protocol that supports exact output.'
        )
      }
      return buildBridgeOptions(req)
    case 'swidge':
      return buildSwidgeOptions(req)
    default:
      throw new WdkCliError(`Unsupported protocol kind '${kind}'.`, ErrorCode.INVALID_ARGUMENT)
  }
}
