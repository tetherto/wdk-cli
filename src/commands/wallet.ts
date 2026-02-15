import { Command } from 'commander'
import chalk from 'chalk'
import { getAddress, walletInfo, resolveNetwork, resolveIndex } from '../services/wallet-service.js'
import { KeyService } from '../services/key-service.js'
import { Keyring } from '../security/keyring.js'
import { sessionService } from '../services/session-service.js'
import { isValidNetwork } from '../config/networks.js'
import { getKeyringPath, SESSION_TTL_MINUTES } from '../config/constants.js'
import { NetworkNotSupportedError, KeyNotFoundError, handleError } from '../errors/index.js'
import { promptPassword } from '../ui/prompts.js'
import { formatBalance, networkColor, formatNetworkLabel } from '../ui/formatters.js'

export function registerWalletCommand(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Derive and inspect HD wallets')

  wallet
    .command('address')
    .description('Derive wallet address for a network and index')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .action(async (options) => {
      try {
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
        const index = resolveIndex(options.index ?? program.opts().index)

        const address = await getAddress(network, index)

        if (program.opts().json) {
          console.log(JSON.stringify({ network, index, address }))
        } else {
          const color = networkColor(network)
          console.log()
          console.log(`  Network: ${color(formatNetworkLabel(network))}`)
          console.log(`  Index:   ${index}`)
          console.log(`  Address: ${address}`)
          console.log()
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  wallet
    .command('info')
    .description('Show wallet address and balance')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .action(async (options) => {
      try {
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
        const index = resolveIndex(options.index ?? program.opts().index)

        const info = await walletInfo(network, index)

        if (program.opts().json) {
          console.log(JSON.stringify({
            ...info,
            balance: info.balance.toString(),
          }))
          return
        }

        const color = networkColor(network)
        console.log()
        console.log(`  Network: ${color(formatNetworkLabel(network))}`)
        console.log(`  Index:   ${index}`)
        console.log(`  Address: ${info.address}`)
        console.log(`  Balance: ${formatBalance(info.balance.toString(), network)}`)
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  wallet
    .command('unlock')
    .description('Unlock wallet session (skip password prompts for subsequent commands)')
    .option('--ttl <minutes>', 'Session duration in minutes', String(SESSION_TTL_MINUTES))
    .action(async (options) => {
      try {
        const keyService = new KeyService(new Keyring(getKeyringPath()))
        if (!(await keyService.hasKey())) {
          throw new KeyNotFoundError()
        }

        if (await sessionService.isActive()) {
          const remaining = await sessionService.ttlRemaining()
          const mins = Math.ceil(remaining / 60000)
          console.log(chalk.yellow(`  Wallet already unlocked (${mins} min remaining)`))
          return
        }

        const password = await promptPassword('Enter password to unlock wallet:')
        const seedPhrase = await keyService.unlock(password)
        const ttl = parseInt(options.ttl, 10)
        await sessionService.create(seedPhrase, ttl)

        console.log()
        console.log(chalk.green('  Wallet unlocked'))
        console.log(chalk.dim(`  Session expires in ${ttl} minutes`))
        console.log(chalk.dim('  Run `wdk wallet lock` to end session early'))
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  wallet
    .command('lock')
    .description('Lock wallet and end active session')
    .action(async () => {
      try {
        await sessionService.destroy()
        console.log()
        console.log(chalk.green('  Wallet locked'))
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}
