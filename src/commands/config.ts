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

import { Command } from 'commander'
import chalk from 'chalk'
import { configService } from '../services/config-service.js'
import { CONFIG_DEFAULTS } from '../config/constants.js'
import { validateNetwork } from '../config/networks.js'
import { handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'
import { promptPassphrase } from '../ui/prompts.js'
import { KeyService } from '../services/key-service.js'
import { WalletKeyring } from '../security/keyring.js'

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: Record<string, unknown> | undefined, k) => (o as Record<string, unknown> | undefined)?.[k] as Record<string, unknown> | undefined, obj as Record<string, unknown> | undefined) as unknown
}

function flatten(obj: Record<string, unknown>, prefix = ''): [string, string][] {
  const result: [string, string][] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flatten(value as Record<string, unknown>, path))
    } else {
      result.push([path, value === '' || value === undefined ? '' : String(value)])
    }
  }
  return result
}

function printEntries(entries: [string, string][]): void {
  if (entries.length === 0) return
  const maxKey = Math.max(...entries.map(([k]) => k.length))
  for (const [key, value] of entries) {
    const display = value || chalk.dim('(not set)')
    console.log(`  ${chalk.bold(key.padEnd(maxKey))}  ${display}`)
  }
}

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage CLI configuration')
    .option('--network <network>', 'Scope to a specific network')

  config.hook('preAction', () => {
    if (program.opts().json) {
      console.error(chalk.red('Error: --json is not supported for config commands.'))
      process.exit(1)
    }
  })

  configureHelp(config, { hideFlags: ['--json'] })

  const getCmd = config
    .command('get')
    .description('Get a config value, or all values if key is omitted')
    .option('--key <key>', 'Config key (omit to show all)')

  configureHelp(getCmd, { hideFlags: ['--json'],
    params: [
      { flags: '--key <key>', description: 'Config key (omit to show all)' },
      { flags: '--network <network>', description: 'Scope to a specific network' },
    ],
  })

  getCmd.action((options: { key?: string }) => {
      try {
        const network = config.opts().network
        const key = options.key

        if (network) {
          validateNetwork(network)
          if (key) {
            const value = configService.get(`networks.${network}.${key}`)
            if (value === undefined) {
              console.log(chalk.yellow(`Key '${key}' is not set for ${network}.`))
            } else {
              console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value))
            }
          } else {
            const networkConfig = configService.get(`networks.${network}`) as Record<string, unknown> | undefined
            if (networkConfig && typeof networkConfig === 'object') {
              console.log()
              console.log(chalk.bold(`  ${network}:`))
              const entries = flatten(networkConfig)
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
          if (value === undefined) {
            console.log(chalk.yellow(`Key '${key}' is not set.`))
          } else {
            console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value))
          }
        } else {
          const all = configService.list()
          printEntries(flatten(all))
          console.log(chalk.dim(`\n  Config file: ${configService.configPath}`))
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const setCmd = config
    .command('set')
    .description('Set a config value (supports JSON for objects)')
    .option('--key <key>', 'Config key')
    .requiredOption('--value <value>', 'Config value (supports JSON for objects)')

  configureHelp(setCmd, { hideFlags: ['--json'],
    params: [
      { flags: '--key <key>', description: 'Config key (required without --network)' },
      { flags: '--value <value>', description: 'Config value (supports JSON for objects)', required: true },
      { flags: '--network <network>', description: 'Scope to a specific network' },
    ],
  })

  setCmd.action(async (options: { key?: string; value: string }) => {
      try {
        const keyService = new KeyService(new WalletKeyring())
        const defaultWallet = configService.getDefaultWallet()
        if (defaultWallet && await keyService.hasKey(defaultWallet)) {
          const passphrase = await promptPassphrase(`Enter passphrase of '${defaultWallet}' wallet to confirm:`)
          await keyService.unlock(passphrase, defaultWallet)
        }
        const network = config.opts().network
        const { key, value } = options

        if (!key && !network) {
          console.log(chalk.red('Error: --key is required (or use --network to set network config)'))
          return
        }

        if (network) validateNetwork(network)

        let parsed: unknown = value
        try { parsed = JSON.parse(value) } catch { /* not JSON, use raw value */ }

        if (network && !key) {
          configService.set(`networks.${network}`, parsed)
          console.log(chalk.green(`Updated config for ${network}`))
        } else if (network && key) {
          configService.set(`networks.${network}.${key}`, parsed)
          console.log(chalk.green(`Set ${key} = ${value} (${network})`))
        } else {
          configService.set(key!, parsed)
          console.log(chalk.green(`Set ${key} = ${value}`))
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const resetCmd = config
    .command('reset')
    .description('Reset a config value to its default')
    .requiredOption('--key <key>', 'Config key')

  configureHelp(resetCmd, { hideFlags: ['--json'],
    params: [
      { flags: '--key <key>', description: 'Config key', required: true },
      { flags: '--network <network>', description: 'Scope to a specific network' },
    ],
  })

  resetCmd.action(async (options: { key: string }) => {
      try {
        const keyService = new KeyService(new WalletKeyring())
        const defaultWallet = configService.getDefaultWallet()
        if (defaultWallet && await keyService.hasKey(defaultWallet)) {
          const passphrase = await promptPassphrase(`Enter passphrase of '${defaultWallet}' wallet to confirm:`)
          await keyService.unlock(passphrase, defaultWallet)
        }
        const network = config.opts().network
        const { key } = options

        if (network) validateNetwork(network)

        let fullKey = key
        if (network) {
          fullKey = `networks.${network}.${key}`
        }

        const defaultValue = getNestedValue(CONFIG_DEFAULTS as Record<string, unknown>, fullKey)
        if (defaultValue !== undefined) {
          configService.set(fullKey, defaultValue)
        } else {
          configService.delete(fullKey)
        }

        if (network) {
          console.log(chalk.green(`Reset ${key} to default (${network}).`))
        } else {
          console.log(chalk.green(`Reset ${key} to default.`))
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const pathCmd = config
    .command('path')
    .description('Show config file path')

  configureHelp(pathCmd, { hideFlags: ['--json'] })

  pathCmd.action(() => {
      console.log(configService.configPath)
    })
}
