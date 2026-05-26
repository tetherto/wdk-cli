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

import chalk from 'chalk'
import {
  getNetworkConfig,
  isTestnet,
  isBuiltinNetwork,
  isCustomNetwork,
  isValidNetwork,
  saveCustomNetwork,
  deleteCustomNetwork,
  parseModuleName,
} from '../config/networks.js'
import { listNetworks } from '../actions/networks.js'
import { configService } from '../services/config-service.js'
import { createTable } from '../ui/tables.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'
import { requirePassphraseConfirmation } from '../ui/auth.js'
import walletsFile from '../../wdk.config.json' with { type: 'json' }

const VALID_WALLET_TYPES = [...new Set(Object.values(walletsFile.networks).map(w => parseModuleName(w.module).name))]
const DEFAULT_DECIMALS = {}
for (const entry of Object.values(walletsFile.networks)) {
  const mod = parseModuleName(entry.module).name
  if (!(mod in DEFAULT_DECIMALS)) {
    DEFAULT_DECIMALS[mod] = entry.decimals
  }
}

/**
 * Registers the `network` subcommand tree (list, create, delete, info) on the root program.
 *
 * @param {import('commander').Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerNetworkCommand(program) {
  const network = program
    .command('network')
    .description('Manage blockchain networks')

  configureHelp(network, {})

  const listCmd = network
    .command('list')
    .description('List supported blockchain networks')
    .option('--testnet', 'Show only testnets')
    .option('--mainnet', 'Show only mainnets')

  configureHelp(listCmd, {
    options: [
      { flags: '--testnet', description: 'Show only testnets' },
      { flags: '--mainnet', description: 'Show only mainnets' },
    ],
  })

  listCmd.action((options) => {
      const result = listNetworks({ testnet: options.testnet, mainnet: options.mainnet })

      if (program.opts().json) {
        console.log(JSON.stringify(result))
        return
      }

      const table = createTable(['Name', 'Network', 'Type', 'Symbol', 'Testnet'])

      for (const n of result.networks) {
        const nameLabel = n.custom ? `${n.name} ${chalk.dim('(custom)')}` : n.name
        table.push([
          chalk.bold(nameLabel),
          n.displayName,
          n.module,
          n.symbol,
          n.testnet ? chalk.dim('yes') : '',
        ])
      }

      console.log(table.toString())
      console.log(chalk.dim(`\n  ${result.count} networks available`))
    })

  const createCmd = network
    .command('create')
    .description('Create a custom network')
    .requiredOption('--name <name>', 'Network identifier (e.g. base, optimism)')
    .requiredOption('--network-data <json>', 'JSON with network definition (displayName, module, nativeSymbol, decimals, testnet, indexer, tokens, config)')

  configureHelp(createCmd, {
    params: [
      { flags: '--name <name>', description: 'Network identifier (e.g. base, optimism)', required: true },
      { flags: '--network-data <json>', description: 'JSON with network definition', required: true },
    ],
  })

  createCmd.action(async (options) => {
      try {
        await requirePassphraseConfirmation()
        const name = options.name

      let jsonData
      try {
        jsonData = JSON.parse(options.networkData)
      } catch {
        throw new WdkCliError('Invalid JSON in --network-data', ErrorCode.INVALID_ARGUMENT)
      }

      const displayName = jsonData.displayName
      const walletType = jsonData.module
      const symbol = jsonData.nativeSymbol
      const decimals = jsonData.decimals ?? (DEFAULT_DECIMALS[walletType] ?? 18)
      const testnet = jsonData.testnet ?? false
      const indexerRaw = jsonData.indexer
      let indexer
      if (indexerRaw && typeof indexerRaw === 'object') {
        const blockchain = indexerRaw.blockchain
        const indexerTokens = Array.isArray(indexerRaw.tokens) ? indexerRaw.tokens.filter((t) => typeof t === 'string') : undefined
        if (!blockchain || !indexerTokens) {
          throw new WdkCliError('indexer must be { blockchain: string, tokens: string[] }', ErrorCode.INVALID_ARGUMENT)
        }
        indexer = { blockchain, tokens: indexerTokens }
      }
      const tokens = Array.isArray(jsonData.tokens) ? jsonData.tokens : undefined
      let networkConfig = {}
      if (jsonData.config && typeof jsonData.config === 'object') {
        networkConfig = jsonData.config
      }

      const missing = []
      if (!displayName) missing.push('displayName')
      if (!walletType) missing.push('module')
      if (!symbol) missing.push('nativeSymbol')
      if (missing.length > 0) {
        throw new WdkCliError(`JSON missing required fields: ${missing.join(', ')}`, ErrorCode.INVALID_ARGUMENT)
      }

      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        throw new WdkCliError('Name must be lowercase alphanumeric with hyphens.', ErrorCode.INVALID_ARGUMENT)
      }
      if (isValidNetwork(name)) {
        throw new WdkCliError(`Network '${name}' already exists.`, ErrorCode.WALLET_EXISTS)
      }
      if (!VALID_WALLET_TYPES.includes(walletType)) {
        throw new WdkCliError(`Wallet type must be one of: ${VALID_WALLET_TYPES.join(', ')}`, ErrorCode.UNSUPPORTED_MODULE)
      }
      if (isNaN(decimals) || decimals < 0 || decimals > 24) {
        throw new WdkCliError('Decimals must be a number between 0 and 24.', ErrorCode.INVALID_ARGUMENT)
      }

      const config = {
        name,
        displayName,
        type: walletType,
        module: walletType,
        nativeSymbol: symbol,
        decimals,
        custom: true,
        testnet,
      }
      if (tokens) config.tokens = tokens
      if (indexer) config.indexer = indexer

      saveCustomNetwork(name, config)
      configService.set(`networks.${name}`, networkConfig)

      const parentOpts = program.opts()
      if (parentOpts.json) {
        console.log(JSON.stringify({ ...config, config: networkConfig }))
        return
      }

      console.log(chalk.green(`Network '${name}' created.`))
      console.log()
      console.log(`  Name:       ${name}`)
      console.log(`  Display:    ${displayName}`)
      console.log(`  Module:     ${walletType}`)
      console.log(`  Symbol:     ${symbol}`)
      console.log(`  Decimals:   ${decimals}`)
      console.log(`  Testnet:    ${testnet ? 'yes' : 'no'}`)
      if (indexer) console.log(`  Indexer:    ${indexer.blockchain} [${indexer.tokens.join(', ')}]`)
      if (tokens) console.log(`  Tokens:     ${tokens.length} configured`)
      if (Object.keys(networkConfig).length > 0) console.log(`  Config:     ${Object.keys(networkConfig).length} keys`)
      console.log()
      if (Object.keys(networkConfig).length === 0) {
        console.log(chalk.dim(`Use wdk config set --key <key> --value <value> --network ${name} to configure network settings.`))
      }
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  const deleteCmd = network
    .command('delete')
    .description('Delete a custom network')
    .requiredOption('--name <name>', 'Network name to delete')

  configureHelp(deleteCmd, {
    params: [
      { flags: '--name <name>', description: 'Network name to delete', required: true },
    ],
  })

  deleteCmd.action(async (options) => {
      try {
        await requirePassphraseConfirmation()
        const name = options.name

        if (isBuiltinNetwork(name)) {
          throw new WdkCliError(`'${name}' is a built-in network and cannot be deleted.`, ErrorCode.INVALID_ARGUMENT)
        }

        if (!isCustomNetwork(name)) {
          throw new WdkCliError(`Custom network '${name}' not found.`, ErrorCode.NETWORK_NOT_SUPPORTED)
        }

        deleteCustomNetwork(name)
        configService.delete(`networks.${name}`)

        if (program.opts().json) {
          console.log(JSON.stringify({ name, deleted: true }))
        } else {
          console.log(chalk.green(`Network '${name}' deleted.`))
        }
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  const info = network
    .command('info')
    .description('Show network details and configuration')
    .requiredOption('--network <network>', 'Blockchain network')

  configureHelp(info, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network', required: true },
    ],
  })

  info.action((options) => {
      try {
        const networkName = options.network
        if (!isValidNetwork(networkName)) throw new WdkCliError(`Network '${networkName}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)

        const config = getNetworkConfig(networkName)
        const netConf = configService.get(`networks.${networkName}`) ?? {}

        if (program.opts().json) {
          console.log(JSON.stringify({ ...config, config: netConf }))
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
