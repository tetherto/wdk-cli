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

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { resolveNetwork, resolveIndex } from '../utils/resolvers.js'
import { handleError } from '../errors/index.js'
import { formatAddress, formatNetworkLabel } from '../ui/formatters.js'
import { configureHelp } from '../ui/help.js'
import { previewSend, executeSend } from '../actions/send.js'

export function registerSendCommand(program: Command): void {
  const send = program
    .command('send')
    .description('Send tokens (native, ERC-20, SPL, TRC-20, ...)')
    .option('--wallet <name>', 'Wallet name')
    .requiredOption('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .requiredOption('--to <address>', 'Recipient address')
    .requiredOption('--amount <value>', 'Amount in base units (wei/satoshis/lamports)')
    .option('--token <address>', 'Token contract address (ERC-20, SPL, TRC-20)')
    .option('--dry-run', 'Estimate fees and show summary without sending')

  configureHelp(send, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network', required: true },
      { flags: '--to <address>', description: 'Recipient address', required: true },
      { flags: '--amount <value>', description: 'Amount in base units (wei/satoshis/lamports)', required: true },
      { flags: '--token <address>', description: 'Token contract address (omit for native)' },
    ],
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' },
      { flags: '--dry-run', description: 'Estimate fees and show summary without sending' },
    ],
  })

  send.action(async (options) => {
      try {
        const network = resolveNetwork(options.network)
        const index = resolveIndex(options.index)

        const sendInput = {
          network,
          index,
          to: options.to,
          amount: options.amount,
          token: options.token,
          wallet: options.wallet,
        }

        const spinner = ora('Estimating fee...').start()
        let preview
        try {
          preview = await previewSend(sendInput)
        } finally {
          spinner.stop()
        }

        const printPreview = (title: string) => {
          console.log()
          console.log(chalk.bold(title))
          console.log(`  Network:   ${formatNetworkLabel(preview.network)}`)
          console.log(`  To:        ${formatAddress(preview.to)}`)
          let amountLine = `  Amount:    ${preview.amountFormatted}`
          if (preview.amountUsd && preview.amountUsd > 0) amountLine += ` (~$${preview.amountUsd.toFixed(2)})`
          console.log(amountLine)
          if (preview.token) {
            console.log(`  Token:     ${preview.token}`)
          }
          let feeLine = `  Est. Fee:  ${preview.estimatedFeeFormatted}`
          if (preview.estimatedFeeUsd && preview.estimatedFeeUsd > 0) feeLine += ` (~$${preview.estimatedFeeUsd.toFixed(2)})`
          console.log(feeLine)
          console.log()
        }

        if (options.dryRun) {
          if (program.opts().json) {
            console.log(JSON.stringify(preview))
          } else {
            printPreview('Transaction Preview (dry run):')
          }
          return
        }

        if (!program.opts().json) {
          printPreview('Transaction Summary:')
        }

        const sendSpinner = ora('Broadcasting transaction...').start()
        try {
          const result = await executeSend(sendInput)
          sendSpinner.succeed('Transaction sent!')

          if (program.opts().json) {
            console.log(JSON.stringify(result))
          } else {
            console.log()
            console.log(`  Network: ${formatNetworkLabel(result.network)}`)
            console.log(`  TX Hash: ${chalk.cyan(result.txHash)}`)
            console.log(`  From:    ${formatAddress(result.from)}`)
            console.log(`  To:      ${formatAddress(result.to)}`)
            console.log(`  Amount:  ${result.amountFormatted}`)
            if (result.feeFormatted) {
              console.log(`  Fee:     ${result.feeFormatted}`)
            }
            console.log()
          }
        } catch (error) {
          sendSpinner.fail('Transaction failed.')
          throw error
        }
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })
}
