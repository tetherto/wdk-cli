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
import { isValidNetwork, getNetworkConfig } from '../config/networks.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { promptConfirm } from '../ui/prompts.js'
import { formatAddress, formatNetworkLabel, formatAmount } from '../ui/formatters.js'
import { getTokenConfig } from '../config/tokens.js'
import { configService } from '../services/config-service.js'
import { convertToUsd } from '../services/price-service.js'
import { daemonClient } from '../daemon/client.js'
import type { NetworkName } from '../types/index.js'

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise.then((v) => { clearTimeout(timer); return v }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s. The RPC provider may be slow or unreachable.`)), ms)
    }),
  ])
}

export function registerSendCommand(program: Command): void {
  program
    .command('send')
    .description('Send native tokens, ERC-20, or SPL tokens')
    .option('--wallet <name>', 'Wallet name')
    .requiredOption('--to <address>', 'Recipient address')
    .requiredOption('--amount <value>', 'Amount in base units (wei/satoshis/lamports)')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--token <address>', 'Token contract address (ERC-20 or SPL mint)')
    .option('--yes', 'Skip confirmation prompt')
    .option('--dry-run', 'Estimate fees and show summary without sending')
    .action(async (options) => {
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
          spinner.stop()
        } catch (error) {
          spinner.stop()
          throw error
        }

        const networkConfig = getNetworkConfig(network)
        const amountBigInt = BigInt(options.amount)

        if (options.dryRun) {
          let amountFormatted: string
          let tokenSymbol: string | undefined
          if (options.token) {
            const tokenConfig = getTokenConfig(network, options.token)
            amountFormatted = tokenConfig
              ? formatAmount(amountBigInt, tokenConfig.decimals, tokenConfig.symbol)
              : `${options.amount} tokens (base units)`
            tokenSymbol = tokenConfig?.symbol
          } else {
            amountFormatted = formatAmount(amountBigInt, networkConfig.decimals, networkConfig.nativeSymbol)
          }
          let amountUsdValue: number | undefined
          let feeUsdValue: number | undefined
          try { amountUsdValue = await convertToUsd(network as NetworkName, amountBigInt, options.token) } catch { /* price unavailable */ }
          try { feeUsdValue = await convertToUsd(network as NetworkName, BigInt(feeQuote.fee)) } catch { /* price unavailable */ }

          const summary = {
            network,
            networkName: networkConfig.displayName,
            to: options.to,
            amount: options.amount,
            amountFormatted,
            amountUsd: amountUsdValue,
            token: options.token,
            tokenSymbol,
            estimatedFee: feeQuote.fee,
            estimatedFeeFormatted: feeQuote.feeFormatted,
            estimatedFeeUsd: feeUsdValue,
          }
          console.log(JSON.stringify(summary))
          return
        }

        if (!program.opts().json) {
          console.log()
          console.log(chalk.bold('Transaction Summary:'))
          console.log(`  Network:   ${formatNetworkLabel(network)}`)
          console.log(`  To:        ${formatAddress(options.to)}`)
          let amountFormatted: string
          if (options.token) {
            const tokenConfig = getTokenConfig(network, options.token)
            amountFormatted = tokenConfig
              ? formatAmount(amountBigInt, tokenConfig.decimals, tokenConfig.symbol)
              : `${options.amount} tokens (base units)`
          } else {
            amountFormatted = formatAmount(amountBigInt, networkConfig.decimals, networkConfig.nativeSymbol)
          }
          let usdDisplay = ''
          try {
            const usd = await convertToUsd(network as NetworkName, amountBigInt, options.token)
            if (usd > 0) usdDisplay = ` (~$${usd.toFixed(2)})`
          } catch { /* price unavailable */ }
          console.log(`  Amount:    ${amountFormatted}${usdDisplay}`)
          if (options.token) {
            console.log(`  Token:     ${options.token}`)
          }
          let feeUsdDisplay = ''
          try {
            const feeUsd = await convertToUsd(network as NetworkName, BigInt(feeQuote.fee))
            if (feeUsd > 0) feeUsdDisplay = ` (~$${feeUsd.toFixed(2)})`
          } catch { /* price unavailable */ }
          console.log(`  Est. Fee:  ${feeQuote.feeFormatted}${feeUsdDisplay}`)
          console.log()
        }

        if (!options.yes) {
          const confirmed = await promptConfirm('Send this transaction?')
          if (!confirmed) {
            console.log('Transaction cancelled.')
            return
          }
        }

        const sendSpinner = ora('Broadcasting transaction...').start()
        try {
          const result = await daemonClient.send(network, index, options.to, options.amount, options.token, wallet)
          sendSpinner.succeed('Transaction sent!')

          if (program.opts().json) {
            console.log(JSON.stringify(result))
          } else {
            console.log()
            console.log(`  TX Hash: ${chalk.cyan(result.txHash)}`)
            console.log(`  From:    ${formatAddress(result.from)}`)
            console.log(`  To:      ${formatAddress(result.to)}`)
            if (result.fee) {
              console.log(`  Fee:     ${formatAmount(BigInt(result.fee), networkConfig.decimals, networkConfig.nativeSymbol)}`)
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
