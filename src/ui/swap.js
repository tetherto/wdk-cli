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

import chalk from 'chalk'
import { formatNetworkLabel } from './formatters.js'

/** @typedef {import('../actions/swap.js').SwapPreview} SwapPreview */
/** @typedef {import('../actions/swap.js').SwapResult} SwapResult */
/** @typedef {import('../daemon/protocol.js').SkippedProtocol} SkippedProtocol */

/**
 * Prints the "N protocol(s) skipped" note for the protocols that were tried but
 * did not quote. No-op when nothing was skipped.
 *
 * @param {SkippedProtocol[]} skipped - The skipped protocols with their reasons.
 * @returns {void}
 */
function printSkipped (skipped) {
  if (!skipped || skipped.length === 0) return
  console.log()
  console.log(chalk.yellow(`  ⚠ ${skipped.length} protocol(s) skipped — a better route may exist once fixed:`))
  for (const s of skipped) {
    console.log(chalk.yellow(`     • ${s.protocol} — ${s.reason}`))
  }
}

/**
 * Prints a best-route swap/bridge quote. The estimated side (the one the user
 * did not fix) is prefixed with `~`; the fixed side is shown exactly.
 *
 * @param {SwapPreview} preview - The formatted quote preview.
 * @returns {void}
 */
export function printSwapPreview (preview) {
  const label = preview.kind === 'bridge' ? 'Bridge' : 'Swap'
  const route = preview.toNetwork
    ? `${preview.fromToken} (${formatNetworkLabel(preview.network)}) → ${preview.toToken} (${formatNetworkLabel(preview.toNetwork)})`
    : `${preview.fromToken} → ${preview.toToken} on ${formatNetworkLabel(preview.network)}`

  const payEstimated = preview.exactSide === 'out'
  const pay = payEstimated ? `~${preview.payFormatted}` : preview.payFormatted
  let receive = payEstimated ? preview.receiveFormatted : `~${preview.receiveFormatted}`
  if (preview.receiveUsd && preview.receiveUsd > 0) {
    receive += ` (~$${preview.receiveUsd.toFixed(2)})`
  }

  console.log()
  console.log(chalk.bold(`Best-route ${label} (dry run):`))
  console.log(`  Route:     ${route}`)
  console.log(`  Protocol:  ${chalk.cyan(preview.protocol)}`)
  console.log(`  You pay:   ${pay}`)
  console.log(`  You get:   ${receive}`)
  printSkipped(preview.skipped)
  console.log()
}

/**
 * Prints the result of an executed swap/bridge — the protocol used, amounts,
 * and transaction hash, plus any protocols that were skipped.
 *
 * @param {SwapResult} result - The execution result.
 * @returns {void}
 */
export function printSwapResult (result) {
  const label = result.kind === 'bridge' ? 'Bridge' : 'Swap'
  const route = result.toNetwork
    ? `${result.fromToken} (${formatNetworkLabel(result.network)}) → ${result.toToken} (${formatNetworkLabel(result.toNetwork)})`
    : `${result.fromToken} → ${result.toToken} on ${formatNetworkLabel(result.network)}`

  console.log()
  console.log(chalk.bold(`${label} submitted:`))
  console.log(`  Route:     ${route}`)
  console.log(`  Protocol:  ${chalk.cyan(result.protocol)}`)
  if (result.payFormatted) console.log(`  You paid:  ${result.payFormatted}`)
  if (result.receiveFormatted) console.log(`  You got:   ${result.receiveFormatted}`)
  if (result.txHash) console.log(`  Tx:        ${chalk.cyan(result.txHash)}`)
  printSkipped(result.skipped)
  console.log()
}
