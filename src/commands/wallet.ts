import { Command } from 'commander'
import chalk from 'chalk'
import { walletCreate, walletList, walletInfo, resolveChain, resolveIndex } from '../services/wallet-service.js'
import { isValidChain, CHAIN_NAMES } from '../config/chains.js'
import { ChainNotSupportedError, handleError } from '../errors/index.js'
import { formatBalance, formatAddress, chainColor, formatChainLabel } from '../ui/formatters.js'
import { createTable } from '../ui/tables.js'

export function registerWalletCommand(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Create and manage wallets')

  wallet
    .command('create')
    .description('Derive a new wallet for a chain')
    .option('--chain <chain>', 'Blockchain to create wallet on')
    .option('--index <n>', 'Account index')
    .action(async (options) => {
      try {
        const chain = resolveChain(options.chain ?? program.opts().chain)
        if (!isValidChain(chain)) throw new ChainNotSupportedError(chain)
        const index = resolveIndex(options.index ?? program.opts().index)

        const entry = await walletCreate(chain, index)

        if (program.opts().json) {
          console.log(JSON.stringify(entry))
        } else {
          const color = chainColor(chain)
          console.log()
          console.log(chalk.bold('Wallet created:'))
          console.log(`  Chain:   ${color(formatChainLabel(chain))}`)
          console.log(`  Index:   ${index}`)
          console.log(`  Address: ${entry.address}`)
          console.log()
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  wallet
    .command('list')
    .description('List all derived wallets')
    .option('--chain <chain>', 'Filter by chain')
    .action(async (options) => {
      try {
        const chain = options.chain ?? program.opts().chain
        if (chain && !isValidChain(chain)) throw new ChainNotSupportedError(chain)

        const entries = await walletList(chain)

        if (program.opts().json) {
          console.log(JSON.stringify(entries))
          return
        }

        if (entries.length === 0) {
          console.log(chalk.yellow('No wallets found.'))
          console.log(chalk.dim(`Run \`wdk wallet create --chain <chain>\` to create one.`))
          console.log(chalk.dim(`Supported chains: ${CHAIN_NAMES.join(', ')}`))
          return
        }

        const table = createTable(['Chain', 'Index', 'Address', 'Created'])
        for (const entry of entries) {
          const color = chainColor(entry.chain)
          table.push([
            color(formatChainLabel(entry.chain)),
            String(entry.index),
            formatAddress(entry.address, true),
            new Date(entry.createdAt).toLocaleDateString(),
          ])
        }
        console.log(table.toString())
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  wallet
    .command('info')
    .description('Show wallet details and balance')
    .option('--chain <chain>', 'Blockchain')
    .option('--index <n>', 'Account index')
    .action(async (options) => {
      try {
        const chain = resolveChain(options.chain ?? program.opts().chain)
        if (!isValidChain(chain)) throw new ChainNotSupportedError(chain)
        const index = resolveIndex(options.index ?? program.opts().index)

        const info = await walletInfo(chain, index)

        if (program.opts().json) {
          console.log(JSON.stringify({
            ...info,
            balance: info.balance.toString(),
          }))
          return
        }

        const color = chainColor(chain)
        console.log()
        console.log(chalk.bold('Wallet Info:'))
        console.log(`  Chain:   ${color(formatChainLabel(chain))}`)
        console.log(`  Index:   ${index}`)
        console.log(`  Address: ${info.address}`)
        console.log(`  Balance: ${formatBalance(info.balance.toString(), chain)}`)
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}
