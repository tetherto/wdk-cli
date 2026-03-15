import { Command } from 'commander'
import chalk from 'chalk'
import { getPolicy, setPolicyValue, addToWhitelist, removeFromWhitelist } from '../services/policy-service.js'
import { getSpendingRecord } from '../services/spending-service.js'
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
    .command('enable')
    .description('Enable policy enforcement')
    .action(() => {
      try {
        setPolicyValue('enabled', true)
        console.log(chalk.green('Policy enforcement enabled.'))
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  policy
    .command('disable')
    .description('Disable policy enforcement')
    .action(() => {
      try {
        setPolicyValue('enabled', false)
        console.log(chalk.yellow('Policy enforcement disabled.'))
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  policy
    .command('set <key> <value>')
    .description('Set a policy value (maxPerCallUsd, maxPerDayUsd, maxTxPerDay)')
    .action((key: string, value: string) => {
      try {
        const validKeys = ['maxPerCallUsd', 'maxPerDayUsd', 'maxTxPerDay']
        if (!validKeys.includes(key)) {
          console.error(chalk.red(`Invalid key: ${key}. Valid keys: ${validKeys.join(', ')}`))
          process.exit(1)
        }

        const numValue = parseFloat(value)
        if (isNaN(numValue) || numValue < 0) {
          console.error(chalk.red('Value must be a non-negative number. Use 0 for unlimited.'))
          process.exit(1)
        }

        setPolicyValue(key, numValue)
        console.log(chalk.green(`Policy ${key} set to ${numValue}.`))
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
    .action((address: string) => {
      try {
        addToWhitelist(address)
        console.log(chalk.green(`Added ${address} to whitelist.`))
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  whitelist
    .command('remove <address>')
    .description('Remove address from whitelist')
    .action((address: string) => {
      try {
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
