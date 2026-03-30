import { Command } from 'commander'
import chalk from 'chalk'
import { configService } from '../services/config-service.js'
import { CONFIG_DEFAULTS } from '../config/constants.js'
import { isValidNetwork } from '../config/networks.js'
import { handleError, NetworkNotSupportedError } from '../errors/index.js'

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
          const value = configService.get(key)
          if (value === undefined) {
            console.log(chalk.yellow(`Key '${key}' is not set.`))
          } else {
            console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value))
          }
        } else {
          const all = configService.list()
          const global: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(all)) {
            if (k !== 'networks') global[k] = v
          }
          printEntries(flatten(global))
        }
      } catch (error) {
        handleError(error, false, program.opts().json)
      }
    })

  config
    .command('set <key> [value]')
    .description('Set config value or full network config with JSON (add --network for per-network config)')
    .action((key: string, value: string | undefined) => {
      try {
        const network = program.opts().network

        // If key is a JSON object and --network is set, replace full network config
        if (network && key.startsWith('{')) {
          validateNetwork(network)
          let jsonConfig: unknown
          try {
            jsonConfig = JSON.parse(key)
          } catch {
            console.log(chalk.red('Error: Invalid JSON'))
            return
          }
          configService.set(`networks.${network}`, jsonConfig)
          console.log(chalk.green(`Updated config for ${network}`))
          return
        }

        if (value === undefined) {
          console.log(chalk.red('Error: <value> is required'))
          return
        }

        if (network) validateNetwork(network)

        let fullKey = key
        if (network) {
          fullKey = `networks.${network}.${key}`
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
        handleError(error, false, program.opts().json)
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
        handleError(error, false, program.opts().json)
      }
    })

  config
    .command('list')
    .description('List all configuration values')
    .action(() => {
      try {
        const parentOpts = program.opts()
        const network = parentOpts.network
        const all = configService.list()

        if (parentOpts.json) {
          console.log(JSON.stringify(all, null, 2))
          return
        }

        if (network) {
          validateNetwork(network)
          const netConf = configService.get(`networks.${network}`) as Record<string, unknown> || {}

          console.log()
          console.log(chalk.bold(`  Configuration for ${network}:`))
          console.log()

          const entries = flatten(netConf)
          if (entries.length === 0) {
            console.log(chalk.dim('  No configuration set.'))
          } else {
            printEntries(entries)
          }
          console.log()
          console.log(chalk.dim(`  Set with: wdk config set <key> <value> --network ${network}`))
        } else {
          printEntries(flatten(all))
        }

        console.log(chalk.dim(`\n  Config file: ${configService.configPath}`))
      } catch (error) {
        handleError(error, false, program.opts().json)
      }
    })

  config
    .command('path')
    .description('Show config file location')
    .action(() => {
      console.log(configService.configPath)
    })
}
