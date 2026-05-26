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

import chalk from 'chalk'
import { resolveNetwork, resolveIndex } from '../utils/resolvers.js'
import { handleError } from '../errors/index.js'
import { formatNetworkLabel } from '../ui/formatters.js'
import { configureHelp } from '../ui/help.js'
import { createRampUrl } from '../actions/ramp.js'


/**
 * @typedef {Object} RampActionOptions
 * @property {string} network - Blockchain network (required).
 * @property {string} token - Crypto asset code, e.g. "usdt" (required).
 * @property {string} [index] - Account index string.
 * @property {string} [fiatCurrency] - Fiat currency code.
 * @property {string} [fiatAmount] - Fiat amount string.
 * @property {string} [cryptoAmount] - Crypto amount string.
 * @property {string} [module] - Fiat provider module name.
 * @property {string} [wallet] - Wallet name.
 */

/**
 * Shared handler that builds a ramp URL for the given direction and prints or JSON-outputs the result.
 *
 * @param {'buy' | 'sell'} direction - The ramp direction.
 * @param {RampActionOptions} options - Parsed Commander options for the buy/sell command.
 * @param {import('commander').Command} program - The root Commander program instance.
 * @returns {Promise<void>}
 */
async function handleRampAction(direction, options, program) {
  const network = resolveNetwork(options.network)
  const index = resolveIndex(options.index)

  const result = await createRampUrl({
    direction,
    network,
    index,
    token: options.token,
    module: options.module,
    fiatCurrency: options.fiatCurrency,
    fiatAmount: options.fiatAmount,
    cryptoAmount: options.cryptoAmount,
    wallet: options.wallet,
  })

  if (program.opts().json) {
    console.log(JSON.stringify(result))
  } else {
    const label = direction === 'buy' ? 'Buy' : 'Sell'
    console.log()
    console.log(chalk.bold(`${label} Crypto:`))
    console.log(`  Network:  ${formatNetworkLabel(result.network)}`)
    console.log(`  Address:  ${result.address}`)
    console.log(`  Token:    ${result.token.toUpperCase()}`)
    console.log(`  Module:   ${result.module}`)
    console.log(`  Pay:      ${result.payAmount}`)
    if (result.receiveAmount) console.log(`  Receive:  ~${result.receiveAmount}`)
    if (result.fee) console.log(`  Fee:      ${result.fee}`)
    if (result.rate) console.log(`  Rate:     1 ${result.token.toUpperCase()} ≈ ${result.rate} ${result.fiatCurrency.toUpperCase()}`)
    console.log()
    console.log(`  ${chalk.cyan(result.url)}`)
    console.log()
  }
}

/**
 * Registers the `buy` and `sell` commands on the root program.
 *
 * @param {import('commander').Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerRampCommands(program) {
  const buy = program
    .command('buy')
    .description('Buy crypto with fiat via on-ramp provider')
    .option('--wallet <name>', 'Wallet name')
    .requiredOption('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .requiredOption('--token <token>', 'Crypto asset code (e.g. usdt, eth, btc)')
    .option('--fiat-currency <currency>', 'Fiat currency code', 'usd')
    .option('--fiat-amount <value>', 'Fiat amount (e.g. 100 for $100)')
    .option('--crypto-amount <value>', 'Crypto amount (e.g. 0.05)')
    .option('--module <module>', 'Fiat provider module', 'moonpay')

  configureHelp(buy, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network', required: true },
      { flags: '--token <token>', description: 'Crypto asset code (e.g. usdt, eth, btc)', required: true },
      { flags: '--fiat-amount <value>', description: 'Amount in fiat to spend (e.g. 100), mutually exclusive with --crypto-amount' },
      { flags: '--fiat-currency <currency>', description: 'Fiat currency code (default: usd)' },
      { flags: '--crypto-amount <value>', description: 'Amount in crypto to buy (e.g. 0.05), mutually exclusive with --fiat-amount' },
      { flags: '--module <module>', description: 'Fiat provider module (default: moonpay)' },
    ],
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' },
    ],
  })

  buy.action(async (options) => {
      try {
        await handleRampAction('buy', options, program)
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  const sell = program
    .command('sell')
    .description('Sell crypto for fiat via off-ramp provider')
    .option('--wallet <name>', 'Wallet name')
    .requiredOption('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .requiredOption('--token <token>', 'Crypto asset code (e.g. usdt, eth, btc)')
    .option('--fiat-currency <currency>', 'Fiat currency code', 'usd')
    .option('--fiat-amount <value>', 'Fiat amount (e.g. 200 for $200)')
    .option('--crypto-amount <value>', 'Crypto amount (e.g. 50)')
    .option('--module <module>', 'Fiat provider module', 'moonpay')

  configureHelp(sell, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network', required: true },
      { flags: '--token <token>', description: 'Crypto asset code (e.g. usdt, eth, btc)', required: true },
      { flags: '--fiat-amount <value>', description: 'Amount in fiat to spend (e.g. 200), mutually exclusive with --crypto-amount' },
      { flags: '--fiat-currency <currency>', description: 'Fiat currency code (default: usd)' },
      { flags: '--crypto-amount <value>', description: 'Amount in crypto to sell (e.g. 50), mutually exclusive with --fiat-amount' },
      { flags: '--module <module>', description: 'Fiat provider module (default: moonpay)' },
    ],
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' },
    ],
  })

  sell.action(async (options) => {
      try {
        await handleRampAction('sell', options, program)
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })
}
