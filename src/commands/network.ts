import type { Command } from 'commander'
import chalk from 'chalk'
import {
  getAllNetworks,
  getAllNetworkNames,
  isTestnet,
  isEvmNetwork,
  isBtcNetwork,
  isBuiltinNetwork,
  isCustomNetwork,
  isValidNetwork,
  saveCustomNetwork,
  deleteCustomNetwork,
} from '../config/networks.js'
import { configService } from '../services/config-service.js'
import { createTable } from '../ui/tables.js'
import { networkColor } from '../ui/formatters.js'
import type { NetworkType, NetworkConfig } from '../types/index.js'

const VALID_WALLET_TYPES: NetworkType[] = ['wdk-wallet-evm', 'wdk-wallet-btc', 'wdk-wallet-solana']
const DEFAULT_DECIMALS: Record<NetworkType, number> = {
  'wdk-wallet-evm': 18,
  'wdk-wallet-btc': 8,
  'wdk-wallet-solana': 9,
}

export function registerNetworkCommand(program: Command): void {
  const network = program
    .command('network')
    .description('Manage blockchain networks')

  network
    .command('list')
    .description('List supported blockchain networks')
    .option('--testnet', 'Show only testnets')
    .option('--mainnet', 'Show only mainnets')
    .action((options: { testnet?: boolean; mainnet?: boolean }) => {
      let names = getAllNetworkNames()
      const allNetworks = getAllNetworks()

      if (options.testnet) {
        names = names.filter((n) => isTestnet(n))
      } else if (options.mainnet) {
        names = names.filter((n) => !isTestnet(n))
      }

      const parentOpts = program.opts()
      if (parentOpts.json) {
        const data = names.map((name) => allNetworks[name])
        console.log(JSON.stringify(data, null, 2))
        return
      }

      const table = createTable(['Name', 'Network', 'Type', 'Symbol', 'Testnet'])

      for (const name of names) {
        const config = allNetworks[name]
        const color = networkColor(name)
        const nameLabel = config.custom ? `${name} ${chalk.dim('(custom)')}` : name
        table.push([
          chalk.bold(nameLabel),
          color(config.displayName),
          isEvmNetwork(name) ? chalk.cyan('EVM') : isBtcNetwork(name) ? chalk.yellow('BTC') : chalk.magenta('SOL'),
          config.nativeSymbol,
          isTestnet(name) ? chalk.dim('yes') : '',
        ])
      }

      console.log(table.toString())
      console.log(chalk.dim(`\n  ${names.length} networks available`))
    })

  network
    .command('create')
    .description('Create a custom network')
    .requiredOption('--name <name>', 'Network identifier (e.g. base, optimism)')
    .requiredOption('--display-name <name>', 'Display name (e.g. "Base Mainnet")')
    .requiredOption('--wallet-type <type>', `Wallet type: ${VALID_WALLET_TYPES.join(', ')}`)
    .requiredOption('--symbol <symbol>', 'Native token symbol (e.g. ETH)')
    .requiredOption('--provider <url>', 'Provider/RPC URL')
    .option('--decimals <n>', 'Token decimals (default: based on type)')
    .option('--testnet', 'Mark as testnet')
    .action((options) => {
      const { name, displayName, walletType: type, symbol, provider, testnet } = options

      // Validate name
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        console.error(chalk.red('Error: Name must be lowercase alphanumeric with hyphens.'))
        process.exit(1)
      }
      if (isValidNetwork(name)) {
        console.error(chalk.red(`Error: Network '${name}' already exists.`))
        process.exit(1)
      }

      // Validate wallet type
      if (!VALID_WALLET_TYPES.includes(type as NetworkType)) {
        console.error(chalk.red(`Error: Wallet type must be one of: ${VALID_WALLET_TYPES.join(', ')}`))
        process.exit(1)
      }

      const walletType = type as NetworkType

      // Validate provider URL
      try {
        new URL(provider)
      } catch {
        console.error(chalk.red('Error: Provider must be a valid URL.'))
        process.exit(1)
      }

      // Parse decimals
      const decimals = options.decimals ? parseInt(options.decimals, 10) : DEFAULT_DECIMALS[walletType]
      if (isNaN(decimals) || decimals < 0 || decimals > 24) {
        console.error(chalk.red('Error: Decimals must be a number between 0 and 24.'))
        process.exit(1)
      }

      const config: NetworkConfig = {
        name,
        displayName,
        type: walletType,
        nativeSymbol: symbol,
        decimals,
        custom: true,
        testnet: !!testnet,
        providerUrl: provider,
      }

      // Save custom network
      saveCustomNetwork(name, config)

      // Also register per-network config (matches built-in structure)
      const networkConf: Record<string, string> = { provider }
      if (walletType === 'wdk-wallet-evm') {
        networkConf.transferMaxFee = ''
      }
      configService.set(`networks.${name}`, networkConf)

      const parentOpts = program.opts()
      if (parentOpts.json) {
        console.log(JSON.stringify(config, null, 2))
        return
      }

      console.log(chalk.green(`Network '${name}' created.`))
      console.log()
      console.log(`  Name:       ${name}`)
      console.log(`  Display:    ${displayName}`)
      console.log(`  Wallet:     ${walletType}`)
      console.log(`  Symbol:     ${symbol}`)
      console.log(`  Decimals:   ${decimals}`)
      console.log(`  Provider:   ${provider}`)
      console.log(`  Testnet:    ${testnet ? 'yes' : 'no'}`)
      console.log()
      console.log(chalk.dim(`Use it with --network ${name}`))
    })

  network
    .command('delete <name>')
    .description('Delete a custom network')
    .action((name: string) => {
      if (isBuiltinNetwork(name)) {
        console.error(chalk.red(`Error: '${name}' is a built-in network and cannot be deleted.`))
        process.exit(1)
      }

      if (!isCustomNetwork(name)) {
        console.error(chalk.red(`Error: Custom network '${name}' not found.`))
        process.exit(1)
      }

      deleteCustomNetwork(name)
      // Also clean up per-network config
      configService.delete(`networks.${name}`)
      console.log(chalk.green(`Network '${name}' deleted.`))
    })
}
