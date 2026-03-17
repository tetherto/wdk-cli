import { Command } from 'commander'
import chalk from 'chalk'
import { getAddress, getBalance, resolveNetwork, resolveIndex } from '../services/wallet-service.js'
import { isValidNetwork, getAllNetworkNames, getNetworkConfig, isTestnet } from '../config/networks.js'
import { NetworkNotSupportedError, handleError } from '../errors/index.js'
import { networkColor, formatNetworkLabel, formatAmount, formatAddress, formatTxHash } from '../ui/formatters.js'
import { getTokenTransfers, isIndexerSupported, INDEXER_TOKENS } from '../services/indexer-service.js'
import type { IndexerToken } from '../services/indexer-service.js'
import { createTable } from '../ui/tables.js'
import { convertToUsd } from '../services/price-service.js'
import type { NetworkName } from '../types/index.js'

export function registerGetCommand(program: Command): void {
  const get = program
    .command('get')
    .description('Query wallet address, balance, and transaction history')

  get
    .command('address')
    .description('Derive wallet address for a network. Omit --network to show all.')
    .option('--network <network>', 'Blockchain network (omit for all)')
    .option('--index <n>', 'Account index')
    .option('--testnet', 'Include testnet networks (for all-network mode)')
    .action(async (options) => {
      try {
        const index = resolveIndex(options.index ?? program.opts().index)
        const networkOpt = options.network ?? program.opts().network

        if (networkOpt) {
          const network = resolveNetwork(networkOpt)
          if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)

          const address = await getAddress(network, index)

          if (program.opts().json) {
            console.log(JSON.stringify({ network, index, address }))
          } else {
            const color = networkColor(network)
            console.log()
            console.log(`  Network: ${color(formatNetworkLabel(network))}`)
            console.log(`  Address: ${address}`)
            console.log()
          }
          return
        }

        const showTestnet = options.testnet === true
        const allNames = getAllNetworkNames().filter((n) => isTestnet(n) === showTestnet)

        const results: { network: string; address: string }[] = []

        const tasks = allNames.map(async (network) => {
          try {
            const address = await getAddress(network as NetworkName, index)
            return { network, address }
          } catch {
            return null
          }
        })

        const settled = await Promise.all(tasks)
        for (const r of settled) {
          if (r) results.push(r)
        }

        if (program.opts().json) {
          console.log(JSON.stringify({ index, addresses: results }))
          return
        }

        console.log()
        console.log(chalk.bold(`Wallet Addresses (index: ${index}, ${showTestnet ? 'testnet' : 'mainnet'}):`))
        console.log()
        console.log(`  ${'Network'.padEnd(28)} ${'Address'}`)
        console.log(`  ${'─'.repeat(28)} ${'─'.repeat(44)}`)
        for (const r of results) {
          console.log(`  ${formatNetworkLabel(r.network).padEnd(28)} ${r.address}`)
        }
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  get
    .command('balance')
    .description('Check wallet balance (native, ERC-20, or SPL token). Omit --network to show all.')
    .option('--network <network>', 'Blockchain network (omit for all)')
    .option('--index <n>', 'Account index')
    .option('--token <address>', 'Token contract address (ERC-20 or SPL mint)')
    .option('--testnet', 'Include testnet networks (for all-network mode)')
    .action(async (options) => {
      try {
        const index = resolveIndex(options.index ?? program.opts().index)
        const networkOpt = options.network ?? program.opts().network

        if (networkOpt) {
          const network = resolveNetwork(networkOpt)
          if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)

          const result = await getBalance(network, index, options.token)

          if (program.opts().json) {
            console.log(JSON.stringify({
              network,
              index,
              balance: result.balance.toString(),
              symbol: result.symbol,
              decimals: result.decimals,
              ...(options.token ? { token: options.token } : {}),
            }))
            return
          }

          const color = networkColor(network)
          const formatted = formatAmount(result.balance, result.decimals, result.symbol)

          console.log()
          console.log(`  ${color(formatNetworkLabel(network))} ${chalk.dim(`(index: ${index})`)}`)
          console.log(`  Balance: ${chalk.bold(formatted)}`)
          if (options.token) {
            console.log(`  Token:   ${chalk.dim(options.token)}`)
          }
          console.log()
          return
        }

        const showTestnet = options.testnet === true
        const allNames = getAllNetworkNames().filter((n) => isTestnet(n) === showTestnet)

        const results: { network: string; address: string; balance: string; formatted: string; usd: number }[] = []
        let totalUsd = 0

        const tasks = allNames.map(async (network) => {
          try {
            const address = await getAddress(network as NetworkName, index)
            const result = await getBalance(network as NetworkName, index)
            const formatted = formatAmount(result.balance, result.decimals, result.symbol)
            let usd = 0
            if (result.balance > 0n) {
              try { usd = await convertToUsd(network as NetworkName, result.balance) } catch { /* */ }
            }
            return { network, address, balance: result.balance.toString(), formatted, usd }
          } catch {
            return null
          }
        })

        const settled = await Promise.all(tasks)
        for (const r of settled) {
          if (r) {
            results.push(r)
            totalUsd += r.usd
          }
        }

        if (program.opts().json) {
          console.log(JSON.stringify({ index, balances: results, totalUsd }))
          return
        }

        console.log()
        console.log(chalk.bold(`Wallet Balance (index: ${index}, ${showTestnet ? 'testnet' : 'mainnet'}):`))
        console.log()
        console.log(`  ${'Network'.padEnd(28)} ${'Address'.padEnd(17)} ${'Balance'}`)
        console.log(`  ${'─'.repeat(28)} ${'─'.repeat(17)} ${'─'.repeat(24)}`)
        for (const r of results) {
          const usdStr = chalk.dim(` (~$${r.usd.toFixed(2)})`)
          console.log(`  ${formatNetworkLabel(r.network).padEnd(28)} ${formatAddress(r.address, true).padEnd(17)} ${chalk.bold(r.formatted)}${usdStr}`)
        }
        console.log()
        console.log(`  ${chalk.bold(`Total: ~$${totalUsd.toFixed(2)}`)}`)
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  get
    .command('history')
    .description('Get token transfer history (requires indexer API key)')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--token <token>', `Token: ${INDEXER_TOKENS.join(', ')} (default: usdt)`)
    .option('--limit <n>', 'Number of transfers (default: 10, max: 1000)')
    .action(async (options) => {
      try {
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)

        if (!isIndexerSupported(network)) {
          console.error(chalk.red(`Error: Network '${network}' is not supported by the indexer API.`))
          process.exit(1)
        }

        const index = resolveIndex(options.index ?? program.opts().index)
        const token = (options.token || 'usdt') as IndexerToken
        if (!INDEXER_TOKENS.includes(token)) {
          console.error(chalk.red(`Error: Invalid token '${token}'. Valid: ${INDEXER_TOKENS.join(', ')}`))
          process.exit(1)
        }

        const limit = options.limit ? parseInt(options.limit, 10) : 10
        const address = await getAddress(network, index)
        const transfers = await getTokenTransfers(network, token, address, { limit })

        if (program.opts().json) {
          console.log(JSON.stringify({ network, index, address, token, transfers }))
          return
        }

        const color = networkColor(network)
        console.log()
        console.log(`  ${color(formatNetworkLabel(network))} ${chalk.dim(`(index: ${index})`)}`)
        console.log(`  Address: ${formatAddress(address)}`)
        console.log(`  Token:   ${token.toUpperCase()}`)
        console.log()

        if (transfers.length === 0) {
          console.log(chalk.dim('  No transfers found.'))
          console.log()
          return
        }

        const table = createTable(['Date', 'Direction', 'Amount', 'Counterparty', 'Tx Hash'])
        const addrLower = address.toLowerCase()

        for (const tx of transfers) {
          const date = new Date(tx.timestamp).toLocaleString()
          const isOutgoing = tx.from.toLowerCase() === addrLower
          const direction = isOutgoing ? chalk.red('OUT') : chalk.green('IN')
          const counterparty = isOutgoing ? tx.to : tx.from
          table.push([
            date,
            direction,
            tx.amount,
            formatAddress(counterparty, true),
            formatTxHash(tx.transactionHash),
          ])
        }

        console.log(table.toString())
        console.log(chalk.dim(`\n  ${transfers.length} transfer(s)`))
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}
