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
import { resolveNetwork, resolveIndex } from '../utils/resolvers.js'
import { handleError } from '../errors/index.js'
import { formatNetworkLabel, formatAddress, formatTxHash } from '../ui/formatters.js'
import { INDEXER_TOKENS } from '../services/indexer-service.js'
import { createTable } from '../ui/tables.js'
import { configureHelp } from '../ui/help.js'
import { getBalance, getAllBalances } from '../actions/balance.js'
import { getAddress, getAllAddresses } from '../actions/address.js'
import { getHistory } from '../actions/history.js'

export function registerGetCommand(program: Command): void {
  const get = program
    .command('get')
    .description('Query wallet address, balance, and transaction history')

  configureHelp(get, {})

  const address = get
    .command('address')
    .description('Derive wallet address for a network. Omit --network to show all.')
    .option('--wallet <name>', 'Wallet name')
    .option('--network <network>', 'Blockchain network (omit for all)')
    .option('--index <n>', 'Account index')
    .option('--testnet', 'Include testnet networks (for all-network mode)')

  configureHelp(address, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network (omit for all)' },
    ],
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' },
      { flags: '--testnet', description: 'Include testnet networks (for all-network mode)' },
    ],
  })

  address.action(async (options) => {
      try {
        const index = resolveIndex(options.index)

        if (options.network) {
          const network = resolveNetwork(options.network)
          const result = await getAddress({ network, index, wallet: options.wallet })

          if (program.opts().json) {
            console.log(JSON.stringify(result))
          } else {
            console.log()
            console.log(`  Network: ${formatNetworkLabel(result.network)}`)
            console.log(`  Index:   ${result.index}`)
            console.log(`  Address: ${result.address}`)
            console.log()
          }
          return
        }

        const result = await getAllAddresses({ index, testnet: options.testnet === true, wallet: options.wallet })

        if (program.opts().json) {
          console.log(JSON.stringify(result))
          return
        }

        console.log()
        console.log(chalk.bold(`Wallet Addresses (index: ${result.index}, ${result.type}):`))
        console.log()
        if (result.addresses.length === 0) {
          console.log(chalk.dim('  No addresses available.'))
        } else {
          console.log(`  ${'Network'.padEnd(28)} ${'Address'}`)
          console.log(`  ${'─'.repeat(28)} ${'─'.repeat(44)}`)
          for (const r of result.addresses) {
            console.log(`  ${formatNetworkLabel(r.network).padEnd(28)} ${r.address}`)
          }
        }
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  const balance = get
    .command('balance')
    .description('Check wallet balance (native, ERC-20, or SPL token). Omit --network to show all.')
    .option('--wallet <name>', 'Wallet name')
    .option('--network <network>', 'Blockchain network (omit for all)')
    .option('--index <n>', 'Account index')
    .option('--token <address>', 'Token contract address (ERC-20 or SPL mint)')
    .option('--testnet', 'Include testnet networks (for all-network mode)')

  configureHelp(balance, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network (omit for all)' },
      { flags: '--token <address>', description: 'Token contract address (ERC-20 or SPL mint), omit for native token' },
    ],
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' },
      { flags: '--testnet', description: 'Include testnet networks (for all-network mode)' },
    ],
  })

  balance.action(async (options) => {
      try {
        const index = resolveIndex(options.index)

        if (options.network) {
          const network = resolveNetwork(options.network)
          const result = await getBalance({ network, index, token: options.token, wallet: options.wallet })

          if (program.opts().json) {
            console.log(JSON.stringify(result))
            return
          }

          console.log()
          console.log(`  ${formatNetworkLabel(result.network)} ${chalk.dim(`(index: ${result.index})`)}`)
          console.log(`  Balance: ${chalk.bold(result.formatted)}`)
          if (result.token) {
            console.log(`  Token:   ${chalk.dim(result.token)}`)
          }
          console.log()
          return
        }

        const result = await getAllBalances({ index, testnet: options.testnet === true, wallet: options.wallet })

        if (program.opts().json) {
          console.log(JSON.stringify(result))
          return
        }

        console.log()
        console.log(chalk.bold(`Wallet Balance (index: ${result.index}, ${result.type}):`))
        console.log()
        if (result.balances.length === 0) {
          console.log(chalk.dim('  No balances available.'))
        } else {
          console.log(`  ${'Network'.padEnd(28)} ${'Address'.padEnd(17)} ${'Balance'}`)
          console.log(`  ${'─'.repeat(28)} ${'─'.repeat(17)} ${'─'.repeat(24)}`)
          for (const r of result.balances) {
            const usdStr = chalk.dim(` (~$${r.usd.toFixed(2)})`)
            console.log(`  ${formatNetworkLabel(r.network).padEnd(28)} ${formatAddress(r.address, true).padEnd(17)} ${chalk.bold(r.formatted)}${usdStr}`)
          }
          console.log()
          console.log(`  ${chalk.bold(`Total: ~$${result.totalUsd.toFixed(2)}`)}`)
        }
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  const history = get
    .command('history')
    .description('Get token transfer history (requires indexer API key)')
    .option('--wallet <name>', 'Wallet name')
    .requiredOption('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--token <token>', `Token: ${INDEXER_TOKENS.join(', ')} (default: usdt)`)
    .option('--limit <n>', 'Number of transfers (default: 30)')
    .option('--from-date <date>', 'Start date (ISO 8601, e.g. 2026-01-01)')
    .option('--to-date <date>', 'End date (ISO 8601, e.g. 2026-12-31)')

  configureHelp(history, {
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' },
    ],
    params: [
      { flags: '--network <network>', description: 'Blockchain network', required: true },
      { flags: '--token <token>', description: `Token: ${INDEXER_TOKENS.join(', ')} (default: usdt)` },
      { flags: '--limit <n>', description: 'Number of transfers (default: 30)' },
      { flags: '--from-date <date>', description: 'Start date (ISO 8601, e.g. 2026-01-01)' },
      { flags: '--to-date <date>', description: 'End date (ISO 8601, e.g. 2026-12-31)' },
    ],
  })

  history.action(async (options) => {
      try {
        const network = resolveNetwork(options.network)
        const index = resolveIndex(options.index)
        const limit = options.limit ? parseInt(options.limit, 10) : undefined

        const result = await getHistory({
          network,
          index,
          token: options.token,
          limit,
          fromDate: options.fromDate,
          toDate: options.toDate,
          wallet: options.wallet,
        })

        if (program.opts().json) {
          console.log(JSON.stringify(result))
          return
        }

        console.log()
        console.log(`  ${formatNetworkLabel(result.network)} ${chalk.dim(`(index: ${result.index})`)}`)
        console.log(`  Address: ${formatAddress(result.address)}`)
        console.log(`  Token:   ${result.token.toUpperCase()}`)
        console.log()

        if (result.transfers.length === 0) {
          console.log(chalk.dim('  No transfers found.'))
          console.log()
          return
        }

        const table = createTable(['Date', 'Direction', 'Amount', 'Counterparty', 'Tx Hash'])
        const addrLower = result.address.toLowerCase()

        for (const tx of result.transfers) {
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
        console.log(chalk.dim(`\n  ${result.count} transfer(s)`))
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })
}
