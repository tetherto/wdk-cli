import { Command } from 'commander'
import chalk from 'chalk'
import { getBalance, resolveChain, resolveIndex } from '../services/wallet-service.js'
import { isValidChain, isEvmChain } from '../config/chains.js'
import { ChainNotSupportedError, WdkCliError, handleError } from '../errors/index.js'
import { formatBalance, chainColor, formatChainLabel } from '../ui/formatters.js'

export function registerBalanceCommand(program: Command): void {
  program
    .command('balance')
    .description('Check wallet balance (native or ERC-20 token)')
    .option('--chain <chain>', 'Blockchain')
    .option('--index <n>', 'Account index')
    .option('--token <address>', 'ERC-20 token contract address (EVM only)')
    .action(async (options) => {
      try {
        const chain = resolveChain(options.chain ?? program.opts().chain)
        if (!isValidChain(chain)) throw new ChainNotSupportedError(chain)
        const index = resolveIndex(options.index ?? program.opts().index)

        if (options.token && !isEvmChain(chain)) {
          throw new WdkCliError(
            `Token balances are only supported on EVM chains.`,
            'TOKEN_NOT_SUPPORTED',
            `Use an EVM chain like ethereum, polygon, etc.`,
          )
        }

        const result = await getBalance(chain, index, options.token)

        if (program.opts().json) {
          console.log(JSON.stringify({
            chain,
            index,
            balance: result.balance.toString(),
            symbol: result.symbol,
            decimals: result.decimals,
            ...(options.token ? { token: options.token } : {}),
          }))
          return
        }

        const color = chainColor(chain)
        const formatted = formatBalanceDisplay(result.balance, result.decimals, result.symbol)

        console.log()
        console.log(`  ${color(formatChainLabel(chain))} ${chalk.dim(`(index: ${index})`)}`)
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
