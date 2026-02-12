import type { Command } from 'commander'
import chalk from 'chalk'
import { CHAINS, CHAIN_NAMES, isTestnet, isEvmChain, isBtcChain } from '../config/chains.js'
import { createTable } from '../ui/tables.js'
import { chainColor } from '../ui/formatters.js'

export function registerNetworksCommand(program: Command): void {
  program
    .command('networks')
    .description('List supported blockchain networks')
    .option('--testnet', 'Show only testnets')
    .option('--mainnet', 'Show only mainnets')
    .action((options: { testnet?: boolean; mainnet?: boolean }) => {
      let chains = CHAIN_NAMES

      if (options.testnet) {
        chains = chains.filter((c) => isTestnet(c))
      } else if (options.mainnet) {
        chains = chains.filter((c) => !isTestnet(c))
      }

      const parentOpts = program.opts()
      if (parentOpts.json) {
        const data = chains.map((name) => ({
          name,
          ...CHAINS[name],
        }))
        console.log(JSON.stringify(data, null, 2))
        return
      }

      const table = createTable(['Network', 'Type', 'Symbol', 'Testnet'])

      for (const name of chains) {
        const config = CHAINS[name]
        const color = chainColor(name)
        table.push([
          color(config.displayName),
          isEvmChain(name) ? chalk.cyan('EVM') : isBtcChain(name) ? chalk.yellow('BTC') : chalk.magenta('SOL'),
          config.nativeSymbol,
          isTestnet(name) ? chalk.dim('yes') : '',
        ])
      }

      console.log(table.toString())
      console.log(chalk.dim(`\n  ${chains.length} networks available`))
    })
}
