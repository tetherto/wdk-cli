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

import type { Command } from 'commander'
import chalk from 'chalk'
import {
  getAllNetworks,
  getAllNetworkNames,
  getNetworkConfig,
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
import { NetworkNotSupportedError, handleError } from '../errors/index.js'
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
    .option('--name <name>', 'Network identifier (e.g. base, optimism)')
    .option('--display-name <name>', 'Display name (e.g. "Base Mainnet")')
    .option('--wallet-type <type>', `Wallet type: ${VALID_WALLET_TYPES.join(', ')}`)
    .option('--symbol <symbol>', 'Native token symbol (e.g. ETH)')
    .option('--decimals <n>', 'Token decimals (default: based on type)')
    .option('--testnet', 'Mark as testnet')
    .action((options, cmd) => {
      const { name, displayName, walletType: type, symbol, testnet } = options

      // Check all required options at once
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
      }

      // Save custom network identity
      saveCustomNetwork(name, config)

      // Create empty per-network config entries (user fills via `wdk config set`)
      const networkConf: Record<string, string | number> = {}
      if (walletType === 'wdk-wallet-btc') {
        networkConf.host = ''
        networkConf.port = 0
      } else {
        networkConf.provider = ''
      }
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
      // Also clean up per-network config
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
        const isBtc = isBtcNetwork(networkName)
        const providerUrl = isBtc ? '' : ((configService.get(`networks.${networkName}.provider`) as string) || '')
        const host = isBtc ? ((configService.get(`networks.${networkName}.host`) as string) || '') : ''
        const port = isBtc ? ((configService.get(`networks.${networkName}.port`) as number) || 0) : 0
        const protocol = isBtc ? ((configService.get(`networks.${networkName}.protocol`) as string) || '') : ''
        const btcNetwork = isBtc ? ((configService.get(`networks.${networkName}.network`) as string) || '') : ''
        const bip = isBtc ? ((configService.get(`networks.${networkName}.bip`) as number) || 0) : 0
        const transferMaxFee = (configService.get(`networks.${networkName}.transferMaxFee`) as string) || ''

        if (program.opts().json) {
          console.log(JSON.stringify({
            ...config,
            ...(isBtc ? { host: host || undefined, port: port || undefined, protocol: protocol || undefined, network: btcNetwork || undefined, bip: bip || undefined } : { provider: providerUrl || undefined }),
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
        if (isBtc) {
          console.log(`  Host:           ${host || chalk.dim('(default)')}`)
          console.log(`  Port:           ${port || chalk.dim('(default)')}`)
          console.log(`  Protocol:       ${protocol || chalk.dim('tcp')}`)
          console.log(`  Network:        ${btcNetwork || chalk.dim('(default)')}`)
          console.log(`  BIP:            ${bip || chalk.dim('84')}`)
        } else {
          console.log(`  Provider:       ${providerUrl || chalk.dim('(not set)')}`)
        }
        if (isEvmNetwork(networkName)) {
          console.log(`  TransferMaxFee: ${transferMaxFee || chalk.dim('(not set)')}`)
        }
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}
