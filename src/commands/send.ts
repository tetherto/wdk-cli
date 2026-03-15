import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { ensureInitialized, estimateFee, send, type SendOptions } from '../services/transaction-service.js'
import { resolveNetwork, resolveIndex } from '../services/wallet-service.js'
import { isValidNetwork, isEvmNetwork, getNetworkConfig } from '../config/networks.js'
import { NetworkNotSupportedError, WdkCliError, handleError } from '../errors/index.js'
import { promptConfirm } from '../ui/prompts.js'
import { formatAddress, networkColor, formatNetworkLabel, formatAmount } from '../ui/formatters.js'
import { getTokenConfig } from '../config/tokens.js'
import { enforcePolicies, recordTransaction } from '../services/policy-service.js'
import { convertToUsd } from '../services/price-service.js'
import type { NetworkName } from '../types/index.js'

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

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
    .requiredOption('--to <address>', 'Recipient address')
    .requiredOption('--amount <value>', 'Amount in base units (wei/satoshis/lamports)')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--token <address>', 'Token contract address (ERC-20 or SPL mint)')
    .option('--yes', 'Skip confirmation prompt')
    .option('--dry-run', 'Estimate fees and show summary without sending')
    .action(async (options) => {
      try {
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
        const index = resolveIndex(options.index ?? program.opts().index)

        if (!/^\d+$/.test(options.amount) || options.amount === '0') {
          throw new WdkCliError(
            'Invalid amount. Must be a positive integer in base units (wei/satoshis/lamports).',
            'INVALID_AMOUNT',
            'Do not use decimal points. Example: 1000000 for 1 USDT (6 decimals).',
          )
        }

        if (isEvmNetwork(network) && !EVM_ADDRESS_RE.test(options.to)) {
          throw new WdkCliError(
            `Invalid EVM address: ${options.to}`,
            'INVALID_ADDRESS',
            'Address must be 0x followed by 40 hex characters.',
          )
        }

        const sendOptions: SendOptions = {
          network,
          index,
          to: options.to,
          amount: options.amount,
          token: options.token,
        }

        await ensureInitialized(network)
        const { amountUsd } = await enforcePolicies(sendOptions)

        const spinner = ora('Estimating fee...').start()
        let feeQuote
        try {
          feeQuote = await withTimeout(estimateFee(sendOptions), 30_000, 'Fee estimation')
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
          try { amountUsdValue = await convertToUsd(network as NetworkName, amountBigInt, options.token) } catch { /* */ }
          try { feeUsdValue = await convertToUsd(network as NetworkName, feeQuote.fee) } catch { /* */ }

          const summary = {
            network,
            networkName: networkConfig.displayName,
            to: options.to,
            amount: options.amount,
            amountFormatted,
            amountUsd: amountUsdValue,
            token: options.token,
            tokenSymbol,
            estimatedFee: feeQuote.fee.toString(),
            estimatedFeeFormatted: feeQuote.feeFormatted,
            estimatedFeeUsd: feeUsdValue,
          }
          console.log(JSON.stringify(summary))
          return
        }

        const color = networkColor(network)

        if (!program.opts().json) {
          console.log()
          console.log(chalk.bold('Transaction Summary:'))
          console.log(`  Network:   ${color(formatNetworkLabel(network))}`)
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
            const feeUsd = await convertToUsd(network as NetworkName, feeQuote.fee)
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
          const result = await send(sendOptions)
          sendSpinner.succeed('Transaction sent!')

          recordTransaction(sendOptions, result.txHash, amountUsd)

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
        handleError(error, program.opts().verbose)
      }
    })
}
