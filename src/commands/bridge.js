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
 * Registers the `bridge` command on the root program. Bridging moves the same
 * token to another chain (exact-in only).
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerBridgeCommand (program) {
  const bridge = program
    .command('bridge')
    .description('Move a token to another chain via the best available protocol')
    .option('--wallet <name>', 'Wallet name')
    .requiredOption('--network <network>', 'Source network')
    .option('--index <n>', 'Account index', nonNegativeInt)
    .requiredOption('--token <token>', 'Token to bridge (e.g. usdt). See `wdk token list`')
    .requiredOption('--to-network <network>', 'Destination network')
    .requiredOption('--amount <value>', 'Amount to bridge (decimal, e.g. 100)', decimalAmount)
    .option('--recipient <address>', 'Address that receives the tokens (default: your account)')
    .option('--protocol <name>', 'Force a specific protocol; omit to use the best route')
    .option('--dry-run', 'Quote the best route and show a summary without bridging')

  configureHelp(bridge, {
    params: [
      { flags: '--network <network>', description: 'Source network', required: true },
      { flags: '--token <token>', description: 'Token to bridge (e.g. usdt)', required: true },
      { flags: '--to-network <network>', description: 'Destination network', required: true },
      { flags: '--amount <value>', description: 'Amount to bridge (decimal)', required: true }
    ],
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' },
      { flags: '--recipient <address>', description: 'Address that receives the tokens' },
      { flags: '--protocol <name>', description: 'Force a specific protocol; omit for best route' },
      { flags: '--dry-run', description: 'Quote the best route without bridging' }
    ]
  })

  bridge.action(async (options) => {
    try {
      const input = {
        kind: /** @type {const} */ ('bridge'),
        network: options.network,
        index: resolveIndex(options.index),
        fromToken: options.token,
        toToken: options.token,
        toNetwork: options.toNetwork,
        amountIn: options.amount,
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

      const spinner = program.opts().json ? null : ora('Bridging...').start()
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
