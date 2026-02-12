import { Command } from 'commander'
import chalk from 'chalk'
import { walletCreate, walletInfo, resolveChain, resolveIndex } from '../services/wallet-service.js'
import { isValidChain } from '../config/chains.js'
import { ChainNotSupportedError, handleError } from '../errors/index.js'
import { formatBalance, chainColor, formatChainLabel } from '../ui/formatters.js'

export function registerWalletCommand(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Derive and inspect HD wallets')

  wallet
    .command('address')
    .description('Derive wallet address for a chain and index')
    .option('--chain <chain>', 'Blockchain')
    .option('--index <n>', 'Account index')
    .action(async (options) => {
      try {
        const chain = resolveChain(options.chain ?? program.opts().chain)
        if (!isValidChain(chain)) throw new ChainNotSupportedError(chain)
        const index = resolveIndex(options.index ?? program.opts().index)

        const entry = await walletCreate(chain, index)

        if (program.opts().json) {
          console.log(JSON.stringify({ chain, index, address: entry.address }))
        } else {
          const color = chainColor(chain)
          console.log()
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
    .command('info')
    .description('Show wallet address and balance')
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
