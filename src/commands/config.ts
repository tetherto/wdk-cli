import { Command } from 'commander'
import chalk from 'chalk'
import { configService } from '../services/config-service.js'
import { validateKey, CONFIG_DEFAULTS, getVisibleFields, getMissingFields, isFieldRequired } from '../config/schema.js'
import { isValidNetwork, getNetworkConfig } from '../config/networks.js'
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

        const networkType = network ? getNetworkConfig(network)?.type : undefined
        const error = validateKey(key, value, networkType)
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

        // Show mode guidance for ERC-4337 when setting mode
        if (network && key === 'mode' && networkType === 'wdk-wallet-evm-erc-4337') {
          const currentConf = configService.get(`networks.${network}`) as Record<string, unknown> || {}
          const missing = getMissingFields('wdk-wallet-evm-erc-4337', { ...currentConf, mode: parsed })
          const visible = getVisibleFields('wdk-wallet-evm-erc-4337', { ...currentConf, mode: parsed })

          console.log()
          if (missing.length === 0) {
            console.log(chalk.green('All required fields are configured.'))
          } else {
            console.log(chalk.yellow('Required fields to configure:'))
            for (const field of missing) {
              console.log(chalk.yellow(`  - ${field.key}: ${field.description}`))
            }
          }
          console.log()
          console.log(chalk.dim('Configurable fields for this mode:'))
          for (const field of visible) {
            const val = currentConf[field.key]
            const req = isFieldRequired(field, { ...currentConf, mode: parsed }) ? '*' : ' '
            const display = (val === '' || val === undefined || val === null) ? chalk.dim('(not set)') : String(val)
            console.log(chalk.dim(`  ${req} ${field.key.padEnd(22)} ${display}`))
          }
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
          const netConfig = getNetworkConfig(network)
          const netConf = configService.get(`networks.${network}`) as Record<string, unknown> || {}
          const fields = getVisibleFields(netConfig.type, netConf)

          console.log()
          if (netConf.mode) {
            console.log(chalk.bold(`  Configurable fields for ${network} (mode: ${netConf.mode}):`))
          } else {
            console.log(chalk.bold(`  Configurable fields for ${network}:`))
          }
          console.log()

          if (fields.length === 0) {
            console.log(chalk.dim('  No configurable fields.'))
          } else {
            for (const field of fields) {
              const value = netConf[field.key]
              const req = isFieldRequired(field, netConf) ? chalk.dim(' *') : '  '
              let display: string
              if (value === '' || value === null || value === undefined) {
                display = chalk.dim('(not set)')
              } else if (field.secret && value) {
                display = chalk.dim('***')
              } else {
                display = String(value)
              }
              console.log(`    ${field.key.padEnd(22)} ${display}${req}  ${chalk.dim(field.description)}`)
            }
          }
          console.log()
          console.log(chalk.dim(`  * = required`))
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
