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
import { validateKey, CONFIG_DEFAULTS } from '../config/schema.js'
import { isValidNetwork } from '../config/networks.js'
import { handleError, NetworkNotSupportedError } from '../errors/index.js'

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: any, k) => o?.[k], obj)
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

function validateNetwork(network: string): void {
  if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
}

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage CLI configuration')

  config
    .command('get [key]')
    .description('Get config value (add --network for per-network config)')
    .action((key?: string) => {
      try {
        const network = program.opts().network

        if (network) {
          validateNetwork(network)
          // Per-network config
          if (key) {
            const value = configService.get(`networks.${network}.${key}`)
            if (value === undefined) {
              console.log(chalk.yellow(`Key '${key}' is not set for ${network}.`))
            } else {
              console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value))
            }
          } else {
            const networkConfig = configService.get(`networks.${network}`)
            if (networkConfig && typeof networkConfig === 'object') {
              console.log(chalk.bold(`  ${network}:`))
              const entries = flatten(networkConfig as Record<string, unknown>)
              const maxKey = Math.max(...entries.map(([k]) => k.length))
              for (const [k, v] of entries) {
                const display = v || chalk.dim('(not set)')
                console.log(`    ${k.padEnd(maxKey)}  ${display}`)
              }
            } else {
              console.log(chalk.yellow(`No config found for network '${network}'.`))
            }
          }
        } else if (key) {
          // Global key
          const value = configService.get(key)
          if (value === undefined) {
            console.log(chalk.yellow(`Key '${key}' is not set.`))
          } else {
            console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value))
          }
        } else {
          // Show global config
          const all = configService.list()
          const global: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(all)) {
            if (k !== 'networks') global[k] = v
          }
          printEntries(flatten(global))
        }
      } catch (error) {
        handleError(error)
      }
    })

  config
    .command('set <key> <value>')
    .description('Set config value (add --network for per-network config)')
    .action((key: string, value: string) => {
      try {
        const network = program.opts().network

        if (network) validateNetwork(network)

        let fullKey = key
        if (network) {
          fullKey = `networks.${network}.${key}`
        }

        const error = validateKey(key, value)
        if (error) {
          console.log(chalk.red(error))
          return
        }

        let parsed: unknown = value
        try { parsed = JSON.parse(value) } catch { /* keep as string */ }

        configService.set(fullKey, parsed)
        if (network) {
          console.log(chalk.green(`Set ${key} = ${value} (${network})`))
        } else {
          console.log(chalk.green(`Set ${key} = ${value}`))
        }
      } catch (error) {
        handleError(error)
      }
    })

  config
    .command('reset <key>')
    .description('Reset config value to default (add --network for per-network config)')
    .action((key: string) => {
      try {
        const network = program.opts().network

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
        handleError(error)
      }
    })

  config
    .command('list')
    .description('List all configuration values')
    .action(() => {
      try {
        const parentOpts = program.opts()
        const all = configService.list()

        if (parentOpts.json) {
          console.log(JSON.stringify(all, null, 2))
          return
        }

        printEntries(flatten(all))

        console.log(chalk.dim(`\n  Config file: ${configService.configPath}`))
        console.log(chalk.dim(`\n  Examples:`))
        console.log(chalk.dim(`    wdk config get                               # global settings`))
        console.log(chalk.dim(`    wdk config set defaultIndex 1                 # set global`))
        console.log(chalk.dim(`    wdk config get --network ethereum             # network config`))
        console.log(chalk.dim(`    wdk config set provider <url> --network ethereum   # set network`))
      } catch (error) {
        handleError(error)
      }
    })

  config
    .command('path')
    .description('Show config file location')
    .action(() => {
      console.log(configService.configPath)
    })
}
