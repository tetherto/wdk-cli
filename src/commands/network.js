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
  deleteCustomNetwork
} from '../config/networks.js'
import { listNetworks, validateNetworkSpec } from '../actions/networks.js'
import { configService } from '../services/config-service.js'
import { createTable } from '../ui/tables.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'
import { requirePassphraseConfirmation } from '../ui/auth.js'
import { loadJson } from '../ui/parsers.js'
import { saveCustomToken } from '../services/token-service.js'

/** @typedef {import('commander').Command} Command */
/** @typedef {import('../config/wdk-tokens.js').TokenEntry} TokenEntry */

/**
 * Registers the `network` subcommand tree (list, create, delete, info) on the root program.
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerNetworkCommand (program) {
  const network = program.command('network').description('Manage blockchain networks')

  configureHelp(network, {})

  const listCmd = network
    .command('list')
    .description('List supported blockchain networks')
    .option('--testnet', 'Show only testnets')
    .option('--mainnet', 'Show only mainnets')

  configureHelp(listCmd, {
    options: [
      { flags: '--testnet', description: 'Show only testnets' },
      { flags: '--mainnet', description: 'Show only mainnets' }
    ]
  })

  listCmd.action((options) => {
    try {
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
          n.symbol ?? chalk.dim('-'),
          n.testnet ? chalk.dim('yes') : ''
        ])
      }

      console.log(table.toString())
      console.log(chalk.dim(`\n  ${result.count} networks available`))
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  const createCmd = network
    .command('create')
    .description('Create a custom network from a JSON spec (inline or file path)')
    .argument('<data>', 'JSON string or path to JSON file')

  configureHelp(createCmd, {
    args: [
      { flags: '<data>', description: 'JSON string or path to JSON file', required: true }
    ]
  })

  createCmd.action(async (dataArg) => {
    try {
      const spec = validateNetworkSpec(loadJson(dataArg, '<data>'))
      const { network: name, module: walletType, displayName, testnet, indexerSlug } = spec
      const networkConfig = spec.config ?? {}
      const tokens = spec.tokens ?? []

      if (isValidNetwork(name)) {
        throw new WdkCliError(`Network '${name}' already exists.`, ErrorCode.WALLET_EXISTS)
      }

      const config = {
        name,
        displayName,
        type: walletType,
        module: walletType,
        custom: true,
        testnet
      }
      if (indexerSlug) config.indexerSlug = indexerSlug

      await requirePassphraseConfirmation()

      saveCustomNetwork(name, config)
      configService.set(`networks.${name}`, networkConfig)
      const savedTickers = []
      try {
        for (const tok of tokens) {
          const { token: ticker, ...entry } = tok
          saveCustomToken(name, ticker, /** @type {TokenEntry} */ (entry))
          savedTickers.push(ticker)
        }
      } catch (err) {
        for (const ticker of savedTickers) configService.delete(`customTokens.${name}.${ticker}`)
        deleteCustomNetwork(name)
        configService.delete(`networks.${name}`)
        throw err
      }

      if (program.opts().json) {
        console.log(JSON.stringify({
          ...config,
          config: networkConfig,
          tokens
        }))
        return
      }

      console.log(chalk.green(`Network '${name}' created.`))
      console.log()
      console.log(`  Name:       ${name}`)
      console.log(`  Display:    ${displayName}`)
      console.log(`  Module:     ${walletType}`)
      console.log(`  Testnet:    ${testnet ? 'yes' : 'no'}`)
      if (indexerSlug) console.log(`  Indexer:    ${indexerSlug}`)
      if (Object.keys(networkConfig).length > 0) { console.log(`  Config:     ${Object.keys(networkConfig).length} keys`) }
      if (tokens.length > 0) {
        console.log(`  Tokens:     ${tokens.map((t) => t.token).join(', ')}`)
      }
      console.log()
      const hasNative = tokens.some((t) => t.isNative)
      if (!hasNative) {
        console.log(
          chalk.dim(
            `Next: register the native asset:\n  wdk token add '{"network":"${name}","token":"<ticker>","symbol":"...","decimals":...,"isNative":true}'`
          )
        )
      }
      if (Object.keys(networkConfig).length === 0) {
        console.log(
          chalk.dim(
            `Configure RPC with: wdk config set --key provider --value <url> --network ${name}`
          )
        )
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
    params: [{ flags: '--name <name>', description: 'Network name to delete', required: true }]
  })

  deleteCmd.action(async (options) => {
    try {
      const name = options.name

      if (isBuiltinNetwork(name)) {
        throw new WdkCliError(
          `'${name}' is a built-in network and cannot be deleted.`,
          ErrorCode.INVALID_ARGUMENT
        )
      }

      if (!isCustomNetwork(name)) {
        throw new WdkCliError(
          `Custom network '${name}' not found.`,
          ErrorCode.NETWORK_NOT_SUPPORTED
        )
      }

      await requirePassphraseConfirmation()

      deleteCustomNetwork(name)
      configService.delete(`networks.${name}`)
      configService.delete(`customTokens.${name}`)

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
    params: [{ flags: '--network <network>', description: 'Blockchain network', required: true }]
  })

  info.action((options) => {
    try {
      const networkName = options.network
      if (!isValidNetwork(networkName)) {
        throw new WdkCliError(
          `Network '${networkName}' is not supported.`,
          ErrorCode.NETWORK_NOT_SUPPORTED
        )
      }

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
      console.log(`  Symbol:     ${config.nativeSymbol ?? chalk.dim('(no native token registered)')}`)
      console.log(`  Decimals:   ${config.decimals ?? chalk.dim('-')}`)
      console.log(`  Testnet:    ${isTestnet(networkName) ? 'yes' : 'no'}`)
      console.log(`  Source:     ${isBuiltinNetwork(networkName) ? 'built-in' : 'custom'}`)
      console.log()

      const entries = Object.entries(netConf)
      if (entries.length > 0) {
        console.log(chalk.bold('  Configuration:'))
        console.log()
        const maxKey = Math.max(...entries.map(([k]) => k.length))
        for (const [key, value] of entries) {
          const display =
            value === '' || value === null || value === undefined
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
