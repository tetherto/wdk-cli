import { Command } from 'commander'
import chalk from 'chalk'
import { getPolicy, setPolicyValue, addToWhitelist, removeFromWhitelist } from '../services/policy-service.js'
import { getSpendingRecord } from '../services/spending-service.js'
import { requirePasswordForPolicy } from '../services/policy-auth.js'
import { handleError } from '../errors/index.js'

export function registerPolicyCommand(program: Command): void {
  const policy = program
    .command('policy')
    .description('Manage spending policies (interactive terminal required)')

  policy
    .command('show')
    .description('Show current policy settings and daily spending')
    .action(() => {
      try {
        const p = getPolicy()
        const spending = getSpendingRecord()

        console.log()
        console.log(chalk.bold('Policy Settings:'))
        console.log(`  Enabled:          ${p.enabled ? chalk.green('yes') : chalk.dim('no')}`)
        const fmtLimit = (val: number, prefix = '$') => val > 0 ? `${prefix}${val}` : chalk.dim('unlimited (0)')
        console.log(`  Max USD per tx:   ${fmtLimit(p.maxPerCallUsd)}  ${chalk.dim('(maxPerCallUsd)')}`)
        console.log(`  Max USD per day:  ${fmtLimit(p.maxPerDayUsd)}  ${chalk.dim('(maxPerDayUsd)')}`)
        console.log(`  Max tx per day:   ${fmtLimit(p.maxTxPerDay, '')}  ${chalk.dim('(maxTxPerDay)')}`)
        console.log(`  Whitelist:        ${p.whitelist.length > 0 ? `${p.whitelist.length} address(es)` : chalk.dim('any address')}`)

        if (p.whitelist.length > 0) {
          for (const addr of p.whitelist) {
            console.log(`    - ${addr}`)
          }
        }

        console.log()
        console.log(chalk.bold(`Today's Spending (${spending.date}):`))
        console.log(`  Total USD:        $${spending.totalUsd.toFixed(2)}`)
        console.log(`  Transactions:     ${spending.txCount}`)
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  policy
    .command('set <key> <value>')
    .description('Set a policy value (enabled, maxPerCallUsd, maxPerDayUsd, maxTxPerDay)')
    .action(async (key: string, value: string) => {
      try {
        const validKeys = ['enabled', 'maxPerCallUsd', 'maxPerDayUsd', 'maxTxPerDay']
        if (!validKeys.includes(key)) {
          console.error(chalk.red(`Invalid key: ${key}. Valid keys: ${validKeys.join(', ')}`))
          process.exit(1)
        }

        let parsed: boolean | number
        if (key === 'enabled') {
          if (value !== 'true' && value !== 'false') {
            console.error(chalk.red('Value for "enabled" must be true or false.'))
            process.exit(1)
          }
          parsed = value === 'true'
        } else {
          parsed = parseFloat(value)
          if (isNaN(parsed) || parsed < 0) {
            console.error(chalk.red('Value must be a non-negative number. Use 0 for unlimited.'))
            process.exit(1)
          }
        }

        await requirePasswordForPolicy()
        setPolicyValue(key, parsed)
        console.log(chalk.green(`Policy ${key} set to ${parsed}.`))
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const whitelist = policy
    .command('whitelist')
    .description('Manage address whitelist')

  whitelist
    .command('add <address>')
    .description('Add address to whitelist')
    .action(async (address: string) => {
      try {
        await requirePasswordForPolicy()
        addToWhitelist(address)
        console.log(chalk.green(`Added ${address} to whitelist.`))
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  whitelist
    .command('remove <address>')
    .description('Remove address from whitelist')
    .action(async (address: string) => {
      try {
        await requirePasswordForPolicy()
        removeFromWhitelist(address)
        console.log(chalk.yellow(`Removed ${address} from whitelist.`))
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  whitelist
    .command('list')
    .description('List whitelisted addresses')
    .action(() => {
      try {
        const p = getPolicy()
        if (p.whitelist.length === 0) {
          console.log(chalk.dim('No whitelisted addresses (all addresses allowed).'))
          return
        }
        console.log()
        for (const addr of p.whitelist) {
          console.log(`  ${addr}`)
        }
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}
