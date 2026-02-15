import { Command } from 'commander'
import chalk from 'chalk'
import { getBalance, resolveNetwork, resolveIndex } from '../services/wallet-service.js'
import { isValidNetwork, isEvmNetwork } from '../config/networks.js'
import { NetworkNotSupportedError, WdkCliError, handleError } from '../errors/index.js'
import { formatBalance, networkColor, formatNetworkLabel } from '../ui/formatters.js'

export function registerBalanceCommand(program: Command): void {
  program
    .command('balance')
    .description('Check wallet balance (native or ERC-20 token)')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--token <address>', 'ERC-20 token contract address (EVM only)')
    .action(async (options) => {
      try {
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
        const index = resolveIndex(options.index ?? program.opts().index)

        if (options.token && !isEvmNetwork(network)) {
          throw new WdkCliError(
            `Token balances are only supported on EVM networks.`,
            'TOKEN_NOT_SUPPORTED',
            `Use an EVM network like ethereum, polygon, etc.`,
          )
        }

        const result = await getBalance(network, index, options.token)

        if (program.opts().json) {
          console.log(JSON.stringify({
            network,
            index,
            balance: result.balance.toString(),
            symbol: result.symbol,
            decimals: result.decimals,
            ...(options.token ? { token: options.token } : {}),
          }))
          return
        }

        const color = networkColor(network)
        const formatted = formatBalanceDisplay(result.balance, result.decimals, result.symbol)

        console.log()
        console.log(`  ${color(formatNetworkLabel(network))} ${chalk.dim(`(index: ${index})`)}`)
        console.log(`  Balance: ${chalk.bold(formatted)}`)
        if (options.token) {
          console.log(`  Token:   ${chalk.dim(options.token)}`)
        }
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}

function formatBalanceDisplay(raw: bigint, decimals: number, symbol: string): string {
  const divisor = BigInt(10 ** decimals)
  const whole = raw / divisor
  const remainder = raw % divisor
  const decimal = remainder.toString().padStart(decimals, '0').replace(/0+$/, '') || '0'
  const trimmed = decimal.slice(0, 8)
  return `${whole}.${trimmed} ${symbol}`
}
