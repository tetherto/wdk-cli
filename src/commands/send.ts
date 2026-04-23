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
import { withTimeout } from '../utils/async.js'
import { isValidNetwork, getNetworkConfig } from '../config/networks.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { formatAddress, formatNetworkLabel, formatAmount, formatTokenAmount } from '../ui/formatters.js'
import { configureHelp } from '../ui/help.js'
import { configService } from '../services/config-service.js'
import { convertToUsd } from '../services/price-service.js'
import { daemonClient } from '../daemon/client.js'
import type { NetworkName } from '../types/index.js'

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
        if (!isValidNetwork(network)) throw new WdkCliError(`Network '${network}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
        const index = options.index ? resolveIndex(options.index) : configService.getDefaultIndex()
        const wallet = options.wallet ?? configService.getDefaultWallet()

        if (!(await daemonClient.isWalletUnlocked(wallet))) {
          throw new WdkCliError(`Wallet '${wallet}' is not unlocked.`, ErrorCode.WALLET_NOT_UNLOCKED, `Run: wdk wallet unlock --name ${wallet}`)
        }

        if (!/^\d+$/.test(options.amount) || options.amount === '0') {
          throw new WdkCliError(
            'Invalid amount. Must be a positive integer in base units (wei/satoshis/lamports).',
            ErrorCode.INVALID_AMOUNT,
            'Do not use decimal points. Example: 1000000 for 1 USDT (6 decimals).',
          )
        }

        const spinner = ora('Estimating fee...').start()
        let feeQuote
        try {
          feeQuote = await withTimeout(
            daemonClient.estimateFee(network, index, options.to, options.amount, options.token, wallet),
            30_000,
            'Fee estimation',
          )
        } finally {
          spinner.stop()
        }

        const networkConfig = getNetworkConfig(network)
        const amountBigInt = BigInt(options.amount)
        const { formatted: amountFormatted, symbol: tokenSymbol } = formatTokenAmount(amountBigInt, options.amount, network, options.token)

        let amountUsd: number | undefined
        let estimatedFeeUsd: number | undefined
        try { amountUsd = await convertToUsd(network as NetworkName, amountBigInt, options.token) } catch { /* price unavailable */ }
        try { estimatedFeeUsd = await convertToUsd(network as NetworkName, BigInt(feeQuote.fee)) } catch { /* price unavailable */ }

        const preview = {
          network,
          networkName: networkConfig.displayName,
          to: options.to,
          amount: options.amount,
          amountFormatted,
          amountUsd,
          token: options.token,
          tokenSymbol,
          estimatedFee: feeQuote.fee,
          estimatedFeeFormatted: feeQuote.feeFormatted,
          estimatedFeeUsd,
        }

        if (options.dryRun) {
          if (program.opts().json) {
            console.log(JSON.stringify(preview))
          } else {
            console.log()
            console.log(chalk.bold('Transaction Preview (dry run):'))
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
          return
        }

        if (!program.opts().json) {
          console.log()
          console.log(chalk.bold('Transaction Summary:'))
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

        const sendSpinner = ora('Broadcasting transaction...').start()
        try {
          const sendData = await daemonClient.send(network, index, options.to, options.amount, options.token, wallet)
          sendSpinner.succeed('Transaction sent!')

          const result = {
            network,
            txHash: sendData.txHash,
            from: sendData.from,
            to: sendData.to,
            amount: options.amount,
            amountFormatted,
            fee: sendData.fee,
            feeFormatted: sendData.fee ? formatAmount(BigInt(sendData.fee), networkConfig.decimals, networkConfig.nativeSymbol) : undefined,
          }

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
