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

import ora from 'ora'
import { resolveIndex } from '../services/config-service.js'
import { handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'
import { nonNegativeInt, decimalAmount } from '../ui/parsers.js'
import { previewSwap, executeSwap } from '../actions/swap.js'
import { printSwapPreview, printSwapResult } from '../ui/swap.js'

/** @typedef {import('commander').Command} Command */

/**
 * Registers the `swap` command on the root program.
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerSwapCommand (program) {
  const swap = program
    .command('swap')
    .description('Swap one token for another via the best available protocol')
    .option('--wallet <name>', 'Wallet name')
    .requiredOption('--network <network>', 'Source network')
    .option('--index <n>', 'Account index', nonNegativeInt)
    .requiredOption('--from-token <token>', 'Token to sell (e.g. usdt). See `wdk token list`')
    .requiredOption('--to-token <token>', 'Token to buy (e.g. eth). See `wdk token list`')
    .option('--to-network <network>', 'Destination network for a cross-chain swap (default: source network)')
    .option('--amount-in <value>', 'Exact amount to sell (decimal, e.g. 100)', decimalAmount)
    .option('--amount-out <value>', 'Exact amount to receive (decimal, e.g. 0.05)', decimalAmount)
    .option('--recipient <address>', 'Address that receives the output (default: your account)')
    .option('--protocol <name>', 'Force a specific protocol; omit to use the best route')
    .option('--dry-run', 'Quote the best route and show a summary without swapping')

  configureHelp(swap, {
    params: [
      { flags: '--network <network>', description: 'Source network', required: true },
      { flags: '--from-token <token>', description: 'Token to sell (e.g. usdt)', required: true },
      { flags: '--to-token <token>', description: 'Token to buy (e.g. eth)', required: true },
      { flags: '--amount-in <value>', description: 'Exact amount to sell (decimal)' },
      { flags: '--amount-out <value>', description: 'Exact amount to receive (decimal)' }
    ],
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' },
      { flags: '--to-network <network>', description: 'Destination network for a cross-chain swap' },
      { flags: '--recipient <address>', description: 'Address that receives the output' },
      { flags: '--protocol <name>', description: 'Force a specific protocol; omit for best route' },
      { flags: '--dry-run', description: 'Quote the best route without swapping' }
    ]
  })

  swap.action(async (options) => {
    try {
      const input = {
        kind: /** @type {const} */ ('swap'),
        network: options.network,
        index: resolveIndex(options.index),
        fromToken: options.fromToken,
        toToken: options.toToken,
        toNetwork: options.toNetwork,
        amountIn: options.amountIn,
        amountOut: options.amountOut,
        recipient: options.recipient,
        protocol: options.protocol,
        wallet: options.wallet
      }

      if (options.dryRun) {
        const spinner = program.opts().json ? null : ora('Finding the best route...').start()
        let preview
        try {
          preview = await previewSwap(input)
        } finally {
          spinner?.stop()
        }
        if (program.opts().json) {
          console.log(JSON.stringify(preview))
        } else {
          printSwapPreview(preview)
        }
        return
      }

      const spinner = program.opts().json ? null : ora('Swapping...').start()
      let result
      try {
        result = await executeSwap(input)
      } finally {
        spinner?.stop()
      }
      if (program.opts().json) {
        console.log(JSON.stringify(result))
      } else {
        printSwapResult(result)
      }
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })
}
