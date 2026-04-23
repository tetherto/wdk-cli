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
import { isValidNetwork } from '../config/networks.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { formatNetworkLabel } from '../ui/formatters.js'
import { configureHelp } from '../ui/help.js'
import { daemonClient } from '../daemon/client.js'
import { configService } from '../services/config-service.js'
import { validateModule, resolveAsset } from '../config/ramp.js'
import { getMoonPayConfig, validateEnvironment, signMoonPayUrl, buildMoonPayUrl } from '../services/moonpay.js'


async function handleRampAction(
  direction: 'buy' | 'sell',
  options: Record<string, string | undefined>,
  program: Command,
): Promise<void> {
  if (options.fiatAmount && options.cryptoAmount) {
    throw new WdkCliError('Cannot specify both --fiat-amount and --crypto-amount.', ErrorCode.INVALID_ARGUMENT)
  }

  const module = validateModule(options.module!)
  const network = resolveNetwork(options.network)
  if (!isValidNetwork(network)) throw new WdkCliError(`Network '${network}' is not supported.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  const index = options.index ? resolveIndex(options.index) : configService.getDefaultIndex()
  const wallet = options.wallet ?? configService.getDefaultWallet()

  if (!(await daemonClient.isWalletUnlocked(wallet))) {
    throw new WdkCliError(`Wallet '${wallet}' is not unlocked.`, ErrorCode.WALLET_NOT_UNLOCKED, `Run: wdk wallet unlock --name ${wallet}`)
  }

  const isJson = program.opts().json
  const { code: cryptoAsset, token } = resolveAsset(network, options.token!, module)

  if (module === 'moonpay') {
    const config = getMoonPayConfig()
    validateEnvironment(network, config.environment)
    const address = await daemonClient.getAddress(network, index, wallet)

    let url = buildMoonPayUrl(direction, config, cryptoAsset, address, options.fiat, options.fiatAmount, options.cryptoAmount)
    url = await signMoonPayUrl(url, config.signUrl)

    const result = {
      direction,
      network,
      address,
      token,
      module,
      fiat: options.fiat!,
      fiatAmount: options.fiatAmount,
      cryptoAmount: options.cryptoAmount,
      url,
    }

    if (isJson) {
      console.log(JSON.stringify(result))
    } else {
      const label = direction === 'buy' ? 'Buy' : 'Sell'
      console.log()
      console.log(chalk.bold(`${label} Crypto:`))
      console.log(`  Network:  ${formatNetworkLabel(result.network)}`)
      console.log(`  Address:  ${result.address}`)
      console.log(`  Token:    ${result.token.toUpperCase()}`)
      console.log(`  Module:   ${result.module}`)
      console.log(`  Fiat:     ${result.fiat.toUpperCase()}`)
      if (result.fiatAmount) console.log(`  Amount:   ${result.fiatAmount} ${result.fiat.toUpperCase()}`)
      if (result.cryptoAmount) console.log(`  Amount:   ${result.cryptoAmount} ${result.token.toUpperCase()}`)
      console.log()
      console.log(`  ${chalk.cyan(result.url)}`)
      console.log()
    }
  }
}

export function registerRampCommands(program: Command): void {
  const buy = program
    .command('buy')
    .description('Buy crypto with fiat via on-ramp provider')
    .option('--wallet <name>', 'Wallet name')
    .requiredOption('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .requiredOption('--token <token>', 'Crypto asset code (e.g. usdt, eth, btc)')
    .option('--fiat <currency>', 'Fiat currency code', 'usd')
    .option('--fiat-amount <value>', 'Fiat amount (e.g. 100 for $100)')
    .option('--crypto-amount <value>', 'Crypto amount (e.g. 0.05)')
    .option('--module <module>', 'Fiat provider module', 'moonpay')

  configureHelp(buy, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network', required: true },
      { flags: '--token <token>', description: 'Crypto asset code (e.g. usdt, eth, btc)', required: true },
      { flags: '--fiat-amount <value>', description: 'Amount in fiat to spend (e.g. 100), mutually exclusive with --crypto-amount' },
      { flags: '--fiat <currency>', description: 'Fiat currency code (default: usd)' },
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
    .option('--fiat <currency>', 'Fiat currency code', 'usd')
    .option('--fiat-amount <value>', 'Fiat amount (e.g. 200 for $200)')
    .option('--crypto-amount <value>', 'Crypto amount (e.g. 50)')
    .option('--module <module>', 'Fiat provider module', 'moonpay')

  configureHelp(sell, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network', required: true },
      { flags: '--token <token>', description: 'Crypto asset code (e.g. usdt, eth, btc)', required: true },
      { flags: '--fiat-amount <value>', description: 'Amount in fiat to spend (e.g. 200), mutually exclusive with --crypto-amount' },
      { flags: '--fiat <currency>', description: 'Fiat currency code (default: usd)' },
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
