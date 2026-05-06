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
import { isValidNetwork, getAllNetworkNames, isTestnet } from '../config/networks.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { formatNetworkLabel, formatAmount, formatAddress, formatTxHash } from '../ui/formatters.js'
import { configService } from '../services/config-service.js'
import { isIndexerSupported, INDEXER_TOKENS } from '../services/indexer-service.js'
import type { IndexerToken } from '../services/indexer-service.js'
import { createTable } from '../ui/tables.js'
import { configureHelp } from '../ui/help.js'
import { convertToUsd } from '../services/price-service.js'
import { daemonClient } from '../daemon/client.js'
import type { NetworkName } from '../types/index.js'

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
        const index = options.index ? resolveIndex(options.index) : configService.getDefaultIndex()
        const networkOpt = options.network
        const wallet = options.wallet ?? configService.getDefaultWallet()

        if (!(await daemonClient.isWalletUnlocked(wallet))) {
          throw new WdkCliError(`Wallet '${wallet}' is not unlocked.`, ErrorCode.WALLET_NOT_UNLOCKED, `Run: wdk wallet unlock --name ${wallet}`)
        }

        if (networkOpt) {
          const network = resolveNetwork(networkOpt)
          if (!isValidNetwork(network)) throw new WdkCliError(`Network '${network}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)

          const address = await daemonClient.getAddress(network, index, wallet)
          const result = { network, index, address }

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

        const showTestnet = options.testnet === true
        const allNames = getAllNetworkNames().filter((n) => isTestnet(n) === showTestnet)

        const results: { network: string; address: string }[] = []

        const tasks = allNames.map(async (network) => {
          try {
            const address = await daemonClient.getAddress(network, index, wallet)
            return { network, address }
          } catch (e) {
            if (program.opts().verbose) {
              console.error(chalk.dim(`  [${network}] ${e instanceof Error ? e.message : String(e)}`))
            }
            return null
          }
        })

        const settled = await Promise.all(tasks)
        for (const r of settled) {
          if (r) results.push(r)
        }

        const result = { index, type: showTestnet ? 'testnet' : 'mainnet', addresses: results }

        if (program.opts().json) {
          console.log(JSON.stringify(result))
          return
        }

        console.log()
        console.log(chalk.bold(`Wallet Addresses (index: ${result.index}, ${result.type}):`))
        console.log()
        if (results.length === 0) {
          console.log(chalk.dim('  No addresses available.'))
        } else {
          console.log(`  ${'Network'.padEnd(28)} ${'Address'}`)
          console.log(`  ${'─'.repeat(28)} ${'─'.repeat(44)}`)
          for (const r of results) {
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
        const index = options.index ? resolveIndex(options.index) : configService.getDefaultIndex()
        const networkOpt = options.network
        const wallet = options.wallet ?? configService.getDefaultWallet()

        if (!(await daemonClient.isWalletUnlocked(wallet))) {
          throw new WdkCliError(`Wallet '${wallet}' is not unlocked.`, ErrorCode.WALLET_NOT_UNLOCKED, `Run: wdk wallet unlock --name ${wallet}`)
        }

        if (networkOpt) {
          const network = resolveNetwork(networkOpt)
          if (!isValidNetwork(network)) throw new WdkCliError(`Network '${network}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)

          const balanceData = await daemonClient.getBalance(network, index, options.token, wallet)
          const formatted = formatAmount(BigInt(balanceData.balance), balanceData.decimals, balanceData.symbol)
          const result = {
            network,
            index,
            balance: balanceData.balance,
            symbol: balanceData.symbol,
            decimals: balanceData.decimals,
            formatted,
            ...(options.token ? { token: options.token } : {}),
          }

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

        const showTestnet = options.testnet === true
        const allNames = getAllNetworkNames().filter((n) => isTestnet(n) === showTestnet)

        const results: { network: string; address: string; balance: string; formatted: string; usd: number }[] = []
        let totalUsd = 0

        const tasks = allNames.map(async (network) => {
          try {
            const address = await daemonClient.getAddress(network, index, wallet)
            const result = await daemonClient.getBalance(network, index, undefined, wallet)
            const balanceBigInt = BigInt(result.balance)
            const formatted = formatAmount(balanceBigInt, result.decimals, result.symbol)
            let usd = 0
            if (balanceBigInt > 0n) {
              try { usd = await convertToUsd(network as NetworkName, balanceBigInt) } catch { /* */ }
            }
            return { network, address, balance: result.balance, formatted, usd }
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

        const result = { index, type: showTestnet ? 'testnet' : 'mainnet', balances: results, totalUsd }

        if (program.opts().json) {
          console.log(JSON.stringify(result))
          return
        }

        console.log()
        console.log(chalk.bold(`Wallet Balance (index: ${result.index}, ${result.type}):`))
        console.log()
        if (results.length === 0) {
          console.log(chalk.dim('  No balances available.'))
        } else {
          console.log(`  ${'Network'.padEnd(28)} ${'Address'.padEnd(17)} ${'Balance'}`)
          console.log(`  ${'─'.repeat(28)} ${'─'.repeat(17)} ${'─'.repeat(24)}`)
          for (const r of results) {
            const usdStr = chalk.dim(` (~$${r.usd.toFixed(2)})`)
            console.log(`  ${formatNetworkLabel(r.network).padEnd(28)} ${formatAddress(r.address, true).padEnd(17)} ${chalk.bold(r.formatted)}${usdStr}`)
          }
          console.log()
          console.log(`  ${chalk.bold(`Total: ~$${totalUsd.toFixed(2)}`)}`)
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
        if (!isValidNetwork(network)) throw new WdkCliError(`Network '${network}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)

        if (!isIndexerSupported(network)) {
          throw new WdkCliError(`Network '${network}' is not supported by the indexer API.`, ErrorCode.NETWORK_NOT_SUPPORTED)
        }

        const index = options.index ? resolveIndex(options.index) : configService.getDefaultIndex()
        const wallet = options.wallet ?? configService.getDefaultWallet()

        if (!(await daemonClient.isWalletUnlocked(wallet))) {
          throw new WdkCliError(`Wallet '${wallet}' is not unlocked.`, ErrorCode.WALLET_NOT_UNLOCKED, `Run: wdk wallet unlock --name ${wallet}`)
        }

        const tokenInput = options.token || 'usdt'
        if (!(INDEXER_TOKENS as readonly string[]).includes(tokenInput)) {
          throw new WdkCliError(`Invalid token '${tokenInput}'. Valid: ${INDEXER_TOKENS.join(', ')}`, ErrorCode.INVALID_TOKEN)
        }
        const token = tokenInput as IndexerToken

        const limit = options.limit ? parseInt(options.limit, 10) : 30
        const fromTs = options.fromDate ? Math.floor(new Date(options.fromDate).getTime() / 1000) : undefined
        const toTs = options.toDate ? Math.floor(new Date(options.toDate).getTime() / 1000) : undefined
        const result = await daemonClient.getHistory(network, token, limit, wallet, fromTs, toTs)
        const address = result.address
        const transfers = result.transfers as { timestamp: number; from: string; to: string; amount: string; transactionHash: string }[]

        if (program.opts().json) {
          console.log(JSON.stringify({ network, index, address, token, transfers, count: transfers.length }))
          return
        }

        console.log()
        console.log(`  ${formatNetworkLabel(network)} ${chalk.dim(`(index: ${index})`)}`)
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
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })
}
