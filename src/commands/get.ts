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
import { getAddress, getBalance, resolveNetwork, resolveIndex } from '../services/wallet-service.js'
import { isValidNetwork } from '../config/networks.js'
import { NetworkNotSupportedError, handleError } from '../errors/index.js'
import { networkColor, formatNetworkLabel, formatAmount } from '../ui/formatters.js'

export function registerGetCommand(program: Command): void {
  const get = program
    .command('get')
    .description('Query wallet address and balance information')

  get
    .command('address')
    .description('Derive wallet address for a network')
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
          console.log(`  Address: ${address}`)
          console.log()
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  get
    .command('balance')
    .description('Check wallet balance (native, ERC-20, or SPL token)')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--token <address>', 'Token contract address (ERC-20 or SPL mint)')
    .action(async (options) => {
      try {
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
        const index = resolveIndex(options.index ?? program.opts().index)

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
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}
