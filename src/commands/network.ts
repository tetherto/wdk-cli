import type { Command } from 'commander'
import chalk from 'chalk'
import {
  getAllNetworks,
  getAllNetworkNames,
  getNetworkConfig,
  isTestnet,
  isBuiltinNetwork,
  isCustomNetwork,
  isValidNetwork,
  saveCustomNetwork,
  deleteCustomNetwork,
} from '../config/networks.js'
import { configService } from '../services/config-service.js'
import { CONFIG_DEFAULTS } from '../config/constants.js'
import { createTable } from '../ui/tables.js'
import { NetworkNotSupportedError, handleError } from '../errors/index.js'
import type { NetworkConfig } from '../types/index.js'
import walletsFile from '../../wdk-config.json' with { type: 'json' }

const VALID_WALLET_TYPES = [...new Set(Object.values(walletsFile.networks).map(w => w.module))]
const DEFAULT_DECIMALS: Record<string, number> = {}
for (const entry of Object.values(walletsFile.networks)) {
  if (!(entry.module in DEFAULT_DECIMALS)) {
    DEFAULT_DECIMALS[entry.module] = entry.decimals
  }
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

      const table = createTable(['Name', 'Network', 'Type', 'Symbol', 'Testnet'])

      for (const name of names) {
        const config = allNetworks[name]
        const nameLabel = config.custom ? `${name} ${chalk.dim('(custom)')}` : name
        table.push([
          chalk.bold(nameLabel),
          config.displayName,
          config.module,
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
    .option('--name <name>', 'Network identifier (e.g. base, optimism)')
    .option('--display-name <name>', 'Display name (e.g. "Base Mainnet")')
    .option('--wallet-type <type>', `Wallet type: ${VALID_WALLET_TYPES.join(', ')}`)
    .option('--symbol <symbol>', 'Native token symbol (e.g. ETH)')
    .option('--decimals <n>', 'Token decimals (default: based on type)')
    .option('--testnet', 'Mark as testnet')
    .action((options, cmd) => {
      const { name, displayName, walletType: type, symbol, testnet } = options

      const missing: string[] = []
      if (!name) missing.push('--name <name>')
      if (!displayName) missing.push('--display-name <name>')
      if (!type) missing.push('--wallet-type <type>')
      if (!symbol) missing.push('--symbol <symbol>')
      if (missing.length > 0) {
        console.error(chalk.red(`Error: missing required options: ${missing.join(', ')}`))
        console.error()
        cmd.outputHelp()
        process.exit(1)
      }

      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        console.error(chalk.red('Error: Name must be lowercase alphanumeric with hyphens.'))
        process.exit(1)
      }
      if (isValidNetwork(name)) {
        console.error(chalk.red(`Error: Network '${name}' already exists.`))
        process.exit(1)
      }

      if (!VALID_WALLET_TYPES.includes(type)) {
        console.error(chalk.red(`Error: Wallet type must be one of: ${VALID_WALLET_TYPES.join(', ')}`))
        process.exit(1)
      }

      const walletType = type

      const decimals = options.decimals ? parseInt(options.decimals, 10) : (DEFAULT_DECIMALS[walletType] ?? 18)
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
      }

      saveCustomNetwork(name, config)

      configService.set(`networks.${name}`, {})

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
      console.log(`  Testnet:    ${testnet ? 'yes' : 'no'}`)
      console.log()
      console.log(chalk.dim(`Use wdk config set <key> <value> --network ${name} to configure network settings.`))
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
      configService.delete(`networks.${name}`)
      console.log(chalk.green(`Network '${name}' deleted.`))
    })

  network
    .command('info')
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
        const netConf = configService.get(`networks.${networkName}`) as Record<string, unknown> || {}

        if (program.opts().json) {
          console.log(JSON.stringify({ ...config, config: netConf }, null, 2))
          return
        }

        console.log()
        console.log(`  ${chalk.bold(config.displayName)}`)
        console.log()
        console.log(`  Name:       ${networkName}`)
        console.log(`  Module:     ${config.module}`)
        console.log(`  Symbol:     ${config.nativeSymbol}`)
        console.log(`  Decimals:   ${config.decimals}`)
        console.log(`  Testnet:    ${isTestnet(networkName) ? 'yes' : 'no'}`)
        console.log(`  Source:     ${isBuiltinNetwork(networkName) ? 'built-in' : 'custom'}`)
        console.log()

        const entries = Object.entries(netConf)
        if (entries.length > 0) {
          console.log(chalk.bold('  Configuration:'))
          console.log()
          const maxKey = Math.max(...entries.map(([k]) => k.length))
          for (const [key, value] of entries) {
            const display = (value === '' || value === null || value === undefined)
              ? chalk.dim('(not set)')
              : String(value)
            console.log(`  ${key.padEnd(maxKey + 2)}${display}`)
          }
        }
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })
}
