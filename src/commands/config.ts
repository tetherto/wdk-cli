import { Command } from 'commander'
import chalk from 'chalk'
import { configService } from '../services/config-service.js'
import { handleError } from '../errors/index.js'

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage CLI configuration')

  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      try {
        // Try to parse as JSON for booleans/numbers
        let parsed: unknown = value
        try {
          parsed = JSON.parse(value)
        } catch {
          // Keep as string
        }
        configService.set(key, parsed)
        console.log(chalk.green(`Set ${key} = ${value}`))
      } catch (error) {
        handleError(error)
      }
    })

  config
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      try {
        const value = configService.get(key)
        if (value === undefined) {
          console.log(chalk.yellow(`Key '${key}' is not set.`))
        } else {
          console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value))
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
        const all = configService.list()
        console.log(JSON.stringify(all, null, 2))
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
