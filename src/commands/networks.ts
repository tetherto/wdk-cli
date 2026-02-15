import type { Command } from 'commander'
import chalk from 'chalk'
import { NETWORKS, NETWORK_NAMES, isTestnet, isEvmNetwork, isBtcNetwork } from '../config/networks.js'
import { createTable } from '../ui/tables.js'
import { networkColor } from '../ui/formatters.js'

export function registerNetworksCommand(program: Command): void {
  program
    .command('networks')
    .description('List supported blockchain networks')
    .option('--testnet', 'Show only testnets')
    .option('--mainnet', 'Show only mainnets')
    .action((options: { testnet?: boolean; mainnet?: boolean }) => {
      let networks = NETWORK_NAMES

      if (options.testnet) {
        networks = networks.filter((n) => isTestnet(n))
      } else if (options.mainnet) {
        networks = networks.filter((n) => !isTestnet(n))
      }

      const parentOpts = program.opts()
      if (parentOpts.json) {
        const data = networks.map((name) => ({
          name,
          ...NETWORKS[name],
        }))
        console.log(JSON.stringify(data, null, 2))
        return
      }

      const table = createTable(['Name', 'Network', 'Type', 'Symbol', 'Testnet'])

      for (const name of networks) {
        const config = NETWORKS[name]
        const color = networkColor(name)
        table.push([
          chalk.bold(name),
          color(config.displayName),
          isEvmNetwork(name) ? chalk.cyan('EVM') : isBtcNetwork(name) ? chalk.yellow('BTC') : chalk.magenta('SOL'),
          config.nativeSymbol,
          isTestnet(name) ? chalk.dim('yes') : '',
        ])
      }

      console.log(table.toString())
      console.log(chalk.dim(`\n  ${networks.length} networks available`))
    })
}
