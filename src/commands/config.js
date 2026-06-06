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
import { configService } from '../services/config-service.js'
import { CONFIG_DEFAULTS } from '../config/constants.js'
import { validateNetwork } from '../config/networks.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'
import { requirePassphraseConfirmation } from '../ui/auth.js'
import { daemonClient } from '../daemon/client.js'

/** @typedef {import('commander').Command} Command */

/**
 * Returns true when the given config path affects the SDK's per-network wallet registration.
 * Changes under `networks.*` require the daemon to be locked so stale wallet managers are dropped.
 *
 * @param {string} fullKey - The dot-separated config key being written.
 * @returns {boolean} True when the path falls under `networks.`.
 */
function affectsSdkRegistration (fullKey) {
  return fullKey === 'networks' || fullKey.startsWith('networks.')
}

/**
 * Traverses a nested object by a dot-separated path and returns the value.
 *
 * @param {Record<string, unknown>} obj - The object to traverse.
 * @param {string} path - Dot-separated key path (e.g. "networks.ethereum.rpc").
 * @returns {unknown} The value at the path, or undefined if not found.
 */
function getNestedValue (obj, path) {
  /** @type {unknown} */
  let cur = obj
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = /** @type {Record<string, unknown>} */ (cur)[key]
  }
  return cur
}

/**
 * Flattens a nested object into a list of dot-path / string-value pairs.
 *
 * @param {Record<string, unknown>} obj - The object to flatten.
 * @param {string} [prefix] - Dot-path prefix accumulated during recursion.
 * @returns {[string, string][]} Flat list of [dotPath, stringValue] tuples.
 */
function flatten (obj, prefix = '') {
  /** @type {[string, string][]} */
  const result = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flatten(/** @type {Record<string, unknown>} */ (value), path))
    } else {
      result.push([path, value === '' || value === undefined ? '' : String(value)])
    }
  }
  return result
}

/**
 * Prints dot-path / value pairs to stdout with aligned columns.
 *
 * @param {[string, string][]} entries - Flat key-value pairs to display.
 * @returns {void}
 */
function printEntries (entries) {
  if (entries.length === 0) return
  const maxKey = Math.max(...entries.map(([k]) => k.length))
  for (const [key, value] of entries) {
    const display = value || chalk.dim('(not set)')
    console.log(`  ${chalk.bold(key.padEnd(maxKey))}  ${display}`)
  }
}

/**
 * Registers the `config` subcommand tree (get, set, reset, path) on the root program.
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerConfigCommand (program) {
  const config = program
    .command('config')
    .description('Manage CLI configuration')
    .option('--network <network>', 'Scope to a specific network')

  function isJson () {
    return !!program.opts().json
  }

  configureHelp(config, {})

  const getCmd = config
    .command('get')
    .description('Get a config value (use --all to dump everything)')
    .option('--key <key>', 'Config key')
    .option('--all', 'Show all config values')

  configureHelp(getCmd, {
    params: [
      { flags: '--key <key>', description: 'Config key' },
      { flags: '--all', description: 'Show all config values' },
      { flags: '--network <network>', description: 'Scope to a specific network' }
    ]
  })

  getCmd.action((options) => {
    try {
      const network = config.opts().network
      const key = options.key
      const all = options.all

      if (!key && !network && !all) {
        throw new WdkCliError(
          'Either --key, --network, or --all is required.',
          ErrorCode.INVALID_ARGUMENT
        )
      }
      if (all && (key || network)) {
        throw new WdkCliError(
          '--all cannot be combined with --key or --network.',
          ErrorCode.INVALID_ARGUMENT
        )
      }

      if (network) {
        validateNetwork(network)
        if (key) {
          const value = configService.get(`networks.${network}.${key}`)
          if (isJson()) {
            console.log(JSON.stringify({ key, network, value: value ?? null }))
          } else if (value === undefined) {
            console.log(chalk.yellow(`Key '${key}' is not set for ${network}.`))
          } else {
            console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value))
          }
        } else {
          const networkConfig = configService.get(`networks.${network}`)
          if (isJson()) {
            console.log(JSON.stringify({ network, config: networkConfig ?? {} }))
          } else if (networkConfig && typeof networkConfig === 'object') {
            console.log()
            console.log(chalk.bold(`  ${network}:`))
            const entries = flatten(/** @type {Record<string, unknown>} */ (networkConfig))
            const maxKey = Math.max(...entries.map(([k]) => k.length))
            for (const [k, v] of entries) {
              const display = v || chalk.dim('(not set)')
              console.log(`    ${k.padEnd(maxKey)}  ${display}`)
            }
            console.log()
          } else {
            console.log(chalk.yellow(`No config found for network '${network}'.`))
          }
        }
      } else if (key) {
        const value = configService.get(key)
        if (isJson()) {
          console.log(JSON.stringify({ key, value: value ?? null }))
        } else if (value === undefined) {
          console.log(chalk.yellow(`Key '${key}' is not set.`))
        } else {
          console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value))
        }
      } else {
        const allConfig = configService.list()
        if (isJson()) {
          console.log(JSON.stringify(allConfig))
        } else {
          printEntries(flatten(allConfig))
          console.log(chalk.dim(`\n  Config file: ${configService.configPath}`))
        }
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })

  const setCmd = config
    .command('set')
    .description('Set a config value (supports JSON for objects)')
    .option('--key <key>', 'Config key')
    .requiredOption('--value <value>', 'Config value (supports JSON for objects)')

  configureHelp(setCmd, {
    params: [
      { flags: '--key <key>', description: 'Config key (required without --network)' },
      {
        flags: '--value <value>',
        description: 'Config value (supports JSON for objects)',
        required: true
      },
      { flags: '--network <network>', description: 'Scope to a specific network' }
    ]
  })

  setCmd.action(async (options) => {
    try {
      const network = config.opts().network
      const { key, value } = options

      if (!key && !network) {
        throw new WdkCliError(
          '--key is required (or use --network to set network config)',
          ErrorCode.INVALID_ARGUMENT
        )
      }

      await requirePassphraseConfirmation()

      if (network) validateNetwork(network)

      let parsed = value
      try {
        parsed = JSON.parse(value)
      } catch {
        /* not JSON, use raw value */
      }

      const fullKey = network ? (key ? `networks.${network}.${key}` : `networks.${network}`) : key

      configService.set(fullKey, parsed)

      if (isJson()) {
        console.log(JSON.stringify({ key: fullKey, value: parsed, success: true }))
      } else if (network && !key) {
        console.log(chalk.green(`Updated config for ${network}`))
      } else if (network && key) {
        console.log(chalk.green(`Set ${key} = ${value} (${network})`))
      } else {
        console.log(chalk.green(`Set ${key} = ${value}`))
      }

      if (affectsSdkRegistration(fullKey)) {
        await daemonClient.lock()
        if (!isJson()) {
          console.log(
            chalk.yellow(
              'Note: all wallets have been locked so the new network config takes effect. Run `wdk wallet unlock` to continue.'
            )
          )
        }
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })

  const resetCmd = config
    .command('reset')
    .description('Reset a config value to its default (or all values with --all)')
    .option('--key <key>', 'Config key')
    .option('--all', 'Reset all config to factory defaults')

  configureHelp(resetCmd, {
    params: [
      { flags: '--key <key>', description: 'Config key' },
      { flags: '--all', description: 'Reset all config to factory defaults' },
      { flags: '--network <network>', description: 'Scope to a specific network' }
    ]
  })

  resetCmd.action(async (options) => {
    try {
      const network = config.opts().network
      const { key, all } = options

      if (!key && !all) {
        throw new WdkCliError(
          'Either --key or --all is required.',
          ErrorCode.INVALID_ARGUMENT
        )
      }
      if (key && all) {
        throw new WdkCliError(
          '--key and --all are mutually exclusive.',
          ErrorCode.INVALID_ARGUMENT
        )
      }
      if (all && network) {
        throw new WdkCliError(
          '--all and --network are mutually exclusive.',
          ErrorCode.INVALID_ARGUMENT
        )
      }

      await requirePassphraseConfirmation()

      if (all) {
        // Preserve user-identity data across the reset — these are user-chosen
        // records, not configuration values: which wallet is the default,
        // user-added networks, and user-added tokens.
        const preservedDefaultWallet = configService.getDefaultWallet()
        const preservedCustomNetworks = configService.get('customNetworks')
        const preservedCustomTokens = configService.get('customTokens')

        configService.clear()

        if (preservedDefaultWallet) configService.setDefaultWallet(preservedDefaultWallet)
        if (preservedCustomNetworks) configService.set('customNetworks', preservedCustomNetworks)
        if (preservedCustomTokens) configService.set('customTokens', preservedCustomTokens)

        await daemonClient.lock()

        if (isJson()) {
          console.log(JSON.stringify({ reset: true, all: true }))
        } else {
          console.log(chalk.green('All config has been reset to factory defaults.'))
          console.log(
            chalk.yellow(
              'Note: all wallets have been locked so the new config takes effect. Run `wdk wallet unlock` to continue.'
            )
          )
        }
        return
      }

      if (network) validateNetwork(network)

      let fullKey = key
      if (network) {
        fullKey = `networks.${network}.${key}`
      }

      const defaultValue = getNestedValue(CONFIG_DEFAULTS, fullKey)
      if (defaultValue !== undefined) {
        configService.set(fullKey, defaultValue)
      } else {
        configService.delete(fullKey)
      }

      if (isJson()) {
        console.log(JSON.stringify({ key: fullKey, reset: true, value: defaultValue ?? null }))
      } else if (network) {
        console.log(chalk.green(`Reset ${key} to default (${network}).`))
      } else {
        console.log(chalk.green(`Reset ${key} to default.`))
      }

      if (affectsSdkRegistration(fullKey)) {
        await daemonClient.lock()
        if (!isJson()) {
          console.log(
            chalk.yellow(
              'Note: all wallets have been locked so the new network config takes effect. Run `wdk wallet unlock` to continue.'
            )
          )
        }
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })

  const pathCmd = config.command('path').description('Show config file path')

  configureHelp(pathCmd, {})

  pathCmd.action(() => {
    if (isJson()) {
      console.log(JSON.stringify({ path: configService.configPath }))
    } else {
      console.log(configService.configPath)
    }
  })
}
