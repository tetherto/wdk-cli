import { Command } from 'commander'
import chalk from 'chalk'
import { getAddress, getBalance, resolveNetwork, resolveIndex } from '../services/wallet-service.js'
import { isValidNetwork, isEvmNetwork, isBuiltinNetwork, isCustomNetwork, getNetworkConfig, isTestnet } from '../config/networks.js'
import { configService } from '../services/config-service.js'
import { NetworkNotSupportedError, WdkCliError, handleError } from '../errors/index.js'
import { networkColor, formatNetworkLabel } from '../ui/formatters.js'

export function registerGetCommand(program: Command): void {
  const get = program
    .command('get')
    .description('Query wallet, network, and balance information')

  get
    .command('address')
    .description('Derive wallet address for a network')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .action(async (options) => {
      try {
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
        const index = resolveIndex(options.index ?? program.opts().index)

        const address = await getAddress(network, index)

        if (program.opts().json) {
          console.log(JSON.stringify({ network, index, address }))
        } else {
          const color = networkColor(network)
          console.log()
          console.log(`  Network: ${color(formatNetworkLabel(network))}`)
          console.log(`  Index:   ${index}`)
          console.log(`  Address: ${address}`)
          console.log()
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  get
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

        const address = await getAddress(network, index)
        const result = await getBalance(network, index, options.token)

        if (program.opts().json) {
          console.log(JSON.stringify({
            network,
            index,
            address,
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
        console.log(`  Address: ${address}`)
        console.log(`  Balance: ${chalk.bold(formatted)}`)
        if (options.token) {
          console.log(`  Token:   ${chalk.dim(options.token)}`)
        }
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  get
    .command('network')
    .description('Show network details and configuration')
    .option('--network <network>', 'Blockchain network')
    .action((options) => {
      try {
        const networkName = options.network ?? program.opts().network
        if (!networkName) {
          console.error(chalk.red('Error: --network is required.'))
          process.exit(1)
        }
        if (!isValidNetwork(networkName)) throw new NetworkNotSupportedError(networkName)

        const config = getNetworkConfig(networkName)
        const providerUrl = (configService.get(`networks.${networkName}.provider`) as string) || ''
        const transferMaxFee = (configService.get(`networks.${networkName}.transferMaxFee`) as string) || ''

        if (program.opts().json) {
          console.log(JSON.stringify({
            ...config,
            provider: providerUrl || undefined,
            transferMaxFee: transferMaxFee || undefined,
          }, null, 2))
          return
        }

        const color = networkColor(networkName)
        console.log()
        console.log(`  ${color(config.displayName)}`)
        console.log()
        console.log(`  Name:       ${networkName}`)
        console.log(`  Type:       ${config.type}`)
        console.log(`  Symbol:     ${config.nativeSymbol}`)
        console.log(`  Decimals:   ${config.decimals}`)
        console.log(`  Testnet:    ${isTestnet(networkName) ? 'yes' : 'no'}`)
        console.log(`  Source:     ${isBuiltinNetwork(networkName) ? 'built-in' : 'custom'}`)
        console.log()
        console.log(`  Provider:       ${providerUrl || chalk.dim('(not set)')}`)
        if (isEvmNetwork(networkName)) {
          console.log(`  TransferMaxFee: ${transferMaxFee || chalk.dim('(not set)')}`)
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
