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
import { resolveTokenIdentifier, getTokenByName, getNativeToken, toBaseUnits } from '../services/token-service.js'
import { convertToUsd } from '../services/price-service.js'
import { validateRecipient } from '../services/address-service.js'
import { getProtocol } from '../services/protocol-service.js'
import { formatAmount } from '../ui/formatters.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('../daemon/protocol.js').SkippedProtocol} SkippedProtocol */

/**
 * @typedef {Object} SwapActionInput
 * @property {'swap' | 'bridge'} kind - Whether to quote a swap or a bridge.
 * @property {string} network - The source network name (binds the source chain to the account).
 * @property {number} index - The BIP-44 account index.
 * @property {string} fromToken - Source token name (e.g. "usdt").
 * @property {string} toToken - Destination token name (e.g. "eth").
 * @property {string} [toNetwork] - Destination network; defaults to the source network.
 * @property {string} [amountIn] - Human-readable exact input amount (mutually exclusive with amountOut).
 * @property {string} [amountOut] - Human-readable exact output amount (mutually exclusive with amountIn).
 * @property {string} [recipient] - The address that receives the output.
 * @property {string} [protocol] - Force a specific protocol; omit for best-route.
 * @property {string} [wallet] - The wallet name (defaults to the active wallet).
 */

/**
 * @typedef {Object} SwapPreview
 * @property {'swap' | 'bridge'} kind - The quote kind.
 * @property {string} network - The source network name.
 * @property {string} [toNetwork] - The destination network, when cross-network.
 * @property {string} from - The account that pays.
 * @property {string} protocol - The protocol that produced the winning quote.
 * @property {string} fromToken - Source token symbol.
 * @property {string} toToken - Destination token symbol.
 * @property {'in' | 'out'} exactSide - Which side the user fixed; the other side is estimated.
 * @property {string} payFormatted - Human-readable amount paid (estimated when exact-out).
 * @property {string} receiveFormatted - Human-readable amount received (estimated when exact-in).
 * @property {string} outputAmount - The received amount in base units.
 * @property {number} [receiveUsd] - Approximate USD value of the received amount.
 * @property {unknown} fees - The winning quote's fee breakdown.
 * @property {string} [feesFormatted] - Human-readable fees charged on top of the quoted amounts.
 * @property {string} [feesIncludedFormatted] - Human-readable note for fees the provider already deducted from the quoted amounts.
 * @property {SkippedProtocol[]} skipped - Protocols that were tried but did not quote, with reasons.
 */

/**
 * @typedef {Object} SwapResult
 * @property {'swap' | 'bridge'} kind - The transaction kind.
 * @property {string} network - The source network name.
 * @property {string} [toNetwork] - The destination network, when cross-network.
 * @property {string} from - The account that paid.
 * @property {string} protocol - The protocol that executed the transaction.
 * @property {string} txHash - The transaction hash (or swidge execution id).
 * @property {string} fromToken - Source token symbol.
 * @property {string} toToken - Destination token symbol.
 * @property {string} [payFormatted] - Human-readable amount paid.
 * @property {string} [receiveFormatted] - Human-readable amount received.
 * @property {SkippedProtocol[]} skipped - Protocols that were tried but did not quote.
 */

/**
 * Resolves a token name to the identifier, decimals, and symbol used to build a
 * quote request. The identifier is the registry's `nativeId` for native assets
 * (undefined when none is declared) and the contract address otherwise.
 *
 * @param {string} network - The network the token lives on.
 * @param {string} token - The token name (e.g. "usdt", "eth").
 * @returns {{ address: string | undefined, decimals: number, symbol: string, isNative: boolean }}
 */
function resolveToken (network, token) {
  const { isNative, address } = resolveTokenIdentifier(network, token)
  const entry = /** @type {import('../services/token-service.js').TokenEntry} */ (
    getTokenByName(network, token)
  )
  return {
    address: isNative ? entry.nativeId : /** @type {string} */ (address),
    decimals: entry.decimals,
    symbol: entry.symbol,
    isNative
  }
}

/**
 * Validates the amounts, resolves both tokens, converts the human amounts to
 * base units, and builds the request sent to the daemon. Shared by the preview
 * and execute paths.
 *
 * @param {SwapActionInput} input - The swap/bridge parameters.
 * @returns {Promise<{ wallet: string, request: object, from: ReturnType<typeof resolveToken>, to: ReturnType<typeof resolveToken>, destNetwork: string, crossNetwork: boolean, amountIn: string | undefined }>}
 */
async function prepareRequest (input) {
  if (input.amountIn && input.amountOut) {
    throw new WdkCliError('Cannot specify both --amount-in and --amount-out.', ErrorCode.INVALID_ARGUMENT)
  }
  if (!input.amountIn && !input.amountOut) {
    throw new WdkCliError('Must specify either --amount-in or --amount-out.', ErrorCode.INVALID_ARGUMENT)
  }

  const wallet = await daemonClient.requireUnlocked(input.wallet)
  validateNetwork(input.network)
  const destNetwork = input.toNetwork || input.network
  if (input.toNetwork) validateNetwork(input.toNetwork)
  const crossNetwork = destNetwork !== input.network
  if (input.kind === 'bridge' && !crossNetwork) {
    throw new WdkCliError(
      'Source and destination network are the same; use `wdk send` for same-chain transfers.',
      ErrorCode.INVALID_ARGUMENT
    )
  }
  if (input.protocol) getProtocol(input.protocol)
  if (input.recipient) validateRecipient(destNetwork, input.recipient)

  const from = resolveToken(input.network, input.fromToken)
  const to = resolveToken(destNetwork, input.toToken)

  const amountIn = input.amountIn
    ? toBaseUnits(input.network, input.fromToken, input.amountIn)
    : undefined
  const amountOut = input.amountOut
    ? toBaseUnits(destNetwork, input.toToken, input.amountOut)
    : undefined

  const request = {
    fromToken: { address: from.address, decimals: from.decimals, symbol: from.symbol, isNative: from.isNative },
    toToken: { address: to.address, decimals: to.decimals, symbol: to.symbol, isNative: to.isNative },
    toChain: crossNetwork ? destNetwork : undefined,
    amountIn,
    amountOut,
    recipient: input.recipient,
    fromSymbol: from.symbol,
    toSymbol: to.symbol,
    toNetwork: crossNetwork ? destNetwork : undefined
  }

  return { wallet, request, from, to, destNetwork, crossNetwork, amountIn }
}

/**
 * Quotes a best-route swap or bridge without executing it, and formats the
 * winning quote for display.
 *
 * @param {SwapActionInput} input - The quote parameters.
 * @returns {Promise<SwapPreview>} The formatted best-route preview.
 */
export async function previewSwap (input) {
  const { wallet, request, from, to, destNetwork, crossNetwork, amountIn } = await prepareRequest(input)
  const quote = await daemonClient.quote(input.kind, input.network, input.index, request, input.protocol, wallet)

  const exactSide = amountIn ? /** @type {const} */ ('in') : /** @type {const} */ ('out')
  const receiveRaw = BigInt(quote.outputAmount)
  const payRaw = amountIn ? BigInt(amountIn) : BigInt(quote.inputAmount ?? '0')
  const receiveUsd = await outputUsdValue(destNetwork, receiveRaw, to)

  return {
    kind: input.kind,
    network: input.network,
    toNetwork: crossNetwork ? destNetwork : undefined,
    from: quote.from,
    protocol: quote.protocol,
    fromToken: from.symbol,
    toToken: to.symbol,
    exactSide,
    payFormatted: formatAmount(payRaw, from.decimals, from.symbol),
    receiveFormatted: formatAmount(receiveRaw, to.decimals, to.symbol),
    outputAmount: quote.outputAmount,
    receiveUsd,
    fees: quote.fees,
    ...formatQuoteFees(input.network, from, to, quote.fees),
    skipped: quote.skipped
  }
}

/**
 * @typedef {Object} FormattedFees
 * @property {string} [feesFormatted] - Fees charged on top of the quoted amounts.
 * @property {string} [feesIncludedFormatted] - Note for fees the provider already deducted from the quoted amounts.
 */

/**
 * Formats the winning quote's fees for display, split by whether the user pays
 * them on top or the provider already deducted them from the quoted amounts.
 * Swap and bridge fees are native-denominated and always on top; swidge fees
 * are itemised per fee (see {@link formatSwidgeFees}). BigInt fees cross the
 * IPC socket as decimal strings.
 *
 * @param {string} network - The source network name.
 * @param {ReturnType<typeof resolveToken>} from - The resolved source token.
 * @param {ReturnType<typeof resolveToken>} to - The resolved destination token.
 * @param {unknown} fees - The winning quote's fee breakdown.
 * @returns {FormattedFees} The formatted fees; empty when the quote reports none.
 */
function formatQuoteFees (network, from, to, fees) {
  const native = getNativeToken(network)
  if (Array.isArray(fees)) {
    return formatSwidgeFees(native ? [from, to, native] : [from, to], fees)
  }
  const f = /** @type {{ gas?: unknown, bridge?: unknown }} */ (fees ?? {})
  if (typeof f.gas !== 'string' || !/^\d+$/.test(f.gas) || !native) return {}
  const parts = [`${formatAmount(BigInt(f.gas), native.decimals, native.symbol)} gas`]
  if (typeof f.bridge === 'string' && /^\d+$/.test(f.bridge)) {
    parts.push(`${formatAmount(BigInt(f.bridge), native.decimals, native.symbol)} bridge fee`)
  }
  return { feesFormatted: parts.join(' + ') }
}

/**
 * Splits a swidge quote's itemised fees into fees paid on top and fees the
 * provider already deducted from the quoted amounts.
 *
 * @param {{ address?: string, symbol: string, decimals: number }[]} tokens - Tokens with known decimals.
 * @param {unknown[]} fees - The provider's itemised fee list.
 * @returns {FormattedFees} The formatted fees; empty when the list is empty.
 */
function formatSwidgeFees (tokens, fees) {
  /** @type {string[]} */
  const paid = []
  /** @type {string[]} */
  const included = []
  let hidden = false // included fees we cannot format

  for (const item of fees) {
    const fee = /** @type {{ type?: unknown, amount?: unknown, token?: unknown, included?: unknown, description?: unknown }} */ (item ?? {})
    const label = typeof fee.description === 'string' && fee.description !== ''
      ? fee.description
      : typeof fee.type === 'string' ? `${fee.type} fee` : 'fee'
    const amount = typeof fee.amount === 'string' && /^\d+$/.test(fee.amount) ? fee.amount : ''
    const tokenId = typeof fee.token === 'string' ? fee.token : ''
    const match = tokens.find((t) =>
      (t.address && t.address.toLowerCase() === tokenId.toLowerCase()) ||
      t.symbol.toUpperCase() === tokenId.toUpperCase()
    )
    const value = amount && match ? formatAmount(BigInt(amount), match.decimals, match.symbol) : ''

    if (fee.included === true) {
      // Already inside the quoted amounts — informational only, never a raw dump.
      if (value) included.push(`${value} ${label}`)
      else hidden = true
    } else {
      // Paid on top — always shown, in raw base units when the token is unknown.
      paid.push([value || amount, value ? '' : tokenId, label].filter(Boolean).join(' '))
    }
  }

  /** @type {FormattedFees} */
  const result = {}
  if (paid.length > 0) result.feesFormatted = paid.join(' + ')
  if (included.length > 0) {
    result.feesIncludedFormatted = `includes ${included.join(' + ')}` + (hidden ? ' and other provider fees' : '')
  } else if (hidden) {
    result.feesIncludedFormatted = 'provider fees included in quote'
  }
  return result
}

/**
 * Executes a best-route swap or bridge: quotes every capable protocol, executes
 * the winner as a single transaction, and formats the result for display.
 *
 * @param {SwapActionInput} input - The swap/bridge parameters.
 * @returns {Promise<SwapResult>} The formatted execution result.
 */
export async function executeSwap (input) {
  const { wallet, request, from, to, destNetwork, crossNetwork, amountIn } = await prepareRequest(input)
  const { protocol, from: payer, result, skipped } = await daemonClient.execute(input.kind, input.network, input.index, request, input.protocol, wallet)

  const r = /** @type {Record<string, string | undefined>} */ (result || {})
  const inBase = r.tokenInAmount ?? r.fromTokenAmount ?? amountIn
  const outBase = r.tokenOutAmount ?? r.toTokenAmount

  return {
    kind: input.kind,
    network: input.network,
    toNetwork: crossNetwork ? destNetwork : undefined,
    from: payer,
    protocol,
    txHash: r.hash ?? r.id ?? '',
    fromToken: from.symbol,
    toToken: to.symbol,
    payFormatted: inBase !== undefined ? formatAmount(BigInt(inBase), from.decimals, from.symbol) : undefined,
    receiveFormatted: outBase !== undefined ? formatAmount(BigInt(outBase), to.decimals, to.symbol) : undefined,
    skipped
  }
}

/**
 * Best-effort USD valuation of the output amount. Price lookups are advisory,
 * so any failure (unknown token, provider down) yields undefined rather than
 * failing the quote.
 *
 * @param {string} network - The network the output token lives on.
 * @param {bigint} amount - The output amount in base units.
 * @param {{ address: string, isNative: boolean }} token - The resolved output token.
 * @returns {Promise<number | undefined>} The USD value, or undefined when unavailable.
 */
async function outputUsdValue (network, amount, token) {
  try {
    return await convertToUsd(network, amount, token.isNative ? undefined : token.address)
  } catch {
    return undefined
  }
}
