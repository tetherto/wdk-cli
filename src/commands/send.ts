import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { estimateFee, send, type SendOptions } from '../services/transaction-service.js'
import { resolveNetwork, resolveIndex } from '../services/wallet-service.js'
import { isValidNetwork, isEvmNetwork, NETWORKS } from '../config/networks.js'
import { NetworkNotSupportedError, WdkCliError, handleError } from '../errors/index.js'
import { promptConfirm } from '../ui/prompts.js'
import { formatAddress, networkColor, formatNetworkLabel, formatTxHash } from '../ui/formatters.js'

export function registerSendCommand(program: Command): void {
  program
    .command('send')
    .description('Send native tokens or ERC-20 tokens')
    .requiredOption('--to <address>', 'Recipient address')
    .requiredOption('--amount <value>', 'Amount in base units (wei/satoshis/lamports)')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--token <address>', 'ERC-20 token contract (EVM only)')
    .option('--max-fee <value>', 'Max fee in base units (EVM only)')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (options) => {
      try {
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
        const index = resolveIndex(options.index ?? program.opts().index)

        if (options.token && !isEvmNetwork(network)) {
          throw new WdkCliError(
            'Token transfers are only supported on EVM networks.',
            'TOKEN_NOT_SUPPORTED',
            'Use an EVM network like ethereum, polygon, etc.',
          )
        }

        const sendOptions: SendOptions = {
          network,
          index,
          to: options.to,
          amount: options.amount,
          token: options.token,
          maxFee: options.maxFee,
        }

        // Estimate fee
        const spinner = ora('Estimating fee...').start()
        let feeQuote
        try {
          feeQuote = await estimateFee(sendOptions)
          spinner.stop()
        } catch (error) {
          spinner.stop()
          throw error
        }

        const networkConfig = NETWORKS[network]
        const color = networkColor(network)

        // Display transaction summary
        if (!program.opts().json) {
          console.log()
          console.log(chalk.bold('Transaction Summary:'))
          console.log(`  Network:   ${color(formatNetworkLabel(network))}`)
          console.log(`  To:        ${formatAddress(options.to)}`)
          console.log(`  Amount:    ${options.amount} ${options.token ? 'tokens' : networkConfig.nativeSymbol} (base units)`)
          if (options.token) {
            console.log(`  Token:     ${options.token}`)
          }
          console.log(`  Est. Fee:  ${feeQuote.feeFormatted}`)
          console.log()
        }

        // Confirm
        if (!options.yes) {
          const confirmed = await promptConfirm('Send this transaction?')
          if (!confirmed) {
            console.log('Transaction cancelled.')
            return
          }
        }

        // Send
        const sendSpinner = ora('Broadcasting transaction...').start()
        try {
          const result = await send(sendOptions)
          sendSpinner.succeed('Transaction sent!')

          if (program.opts().json) {
            console.log(JSON.stringify(result))
          } else {
            console.log()
            console.log(`  TX Hash: ${chalk.cyan(result.txHash)}`)
            console.log(`  From:    ${formatAddress(result.from)}`)
            console.log(`  To:      ${formatAddress(result.to)}`)
            if (result.fee) {
              console.log(`  Fee:     ${result.fee} (base units)`)
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
