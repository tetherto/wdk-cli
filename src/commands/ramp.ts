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
import { isValidNetwork, isTestnet } from '../config/networks.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { formatNetworkLabel } from '../ui/formatters.js'
import { daemonClient } from '../daemon/client.js'
import { configService } from '../services/config-service.js'
import { getModuleAssets } from '../config/ramp.js'

const SUPPORTED_MODULES = ['moonpay'] as const
type RampModule = typeof SUPPORTED_MODULES[number]

const MOONPAY_BUY_ORIGINS = { production: 'https://buy.moonpay.com', sandbox: 'https://buy-sandbox.moonpay.com' }
const MOONPAY_SELL_ORIGINS = { production: 'https://sell.moonpay.com', sandbox: 'https://sell-sandbox.moonpay.com' }

function validateModule(module: string): RampModule {
  if (!SUPPORTED_MODULES.includes(module as RampModule)) {
    throw new WdkCliError(`Unsupported module '${module}'. Available: ${SUPPORTED_MODULES.join(', ')}`, ErrorCode.UNSUPPORTED_MODULE)
  }
  return module as RampModule
}

function resolveAsset(network: string, token: string, module: RampModule): { code: string; token: string } {
  const assets = getModuleAssets(network, module)
  if (!assets) {
    throw new WdkCliError(`Network '${network}' does not support ${module}.`, ErrorCode.NETWORK_NOT_SUPPORTED)
  }
  const asset = assets[token.toLowerCase()]
  if (!asset) {
    const supported = Object.keys(assets).join(', ')
    throw new WdkCliError(`Token '${token}' on '${network}' is not supported by ${module}. Supported: ${supported}`, ErrorCode.TOKEN_NOT_SUPPORTED)
  }
  return { code: asset, token: token.toLowerCase() }
}

function validateEnvironment(network: string, environment: 'production' | 'sandbox'): void {
  if (environment === 'production' && isTestnet(network)) {
    throw new WdkCliError(
      `Cannot use production MoonPay with testnet '${network}'.`,
      ErrorCode.ENVIRONMENT_MISMATCH,
    )
  }
  if (environment === 'sandbox' && !isTestnet(network)) {
    throw new WdkCliError(
      `Cannot use sandbox MoonPay with mainnet '${network}'.`,
      ErrorCode.ENVIRONMENT_MISMATCH,
    )
  }
}

function getMoonPayConfig(): { apiKey: string; signUrl?: string; environment: 'production' | 'sandbox' } {
  const apiKey = configService.get('moonpay.apiKey') as string
  if (!apiKey) {
    throw new WdkCliError('MoonPay API key not configured.', ErrorCode.MISSING_CONFIG, 'Run: wdk config set moonpay.apiKey <your-key>')
  }
  const signUrl = configService.get('moonpay.signUrl') as string || undefined
  const env = (configService.get('moonpay.environment') as string) || 'sandbox'
  if (env !== 'production' && env !== 'sandbox') {
    throw new WdkCliError(`Invalid moonpay.environment '${env}'. Must be 'production' or 'sandbox'.`, ErrorCode.INVALID_CONFIG)
  }
  return { apiKey, signUrl, environment: env }
}

async function signMoonPayUrl(url: string, signEndpoint: string): Promise<string> {
  const response = await fetch(signEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urlForSignature: url }),
  })
  if (!response.ok) {
    throw new WdkCliError(`Failed to sign MoonPay URL: ${response.status} ${response.statusText}`, ErrorCode.SIGN_FAILED)
  }
  const data = await response.json() as Record<string, unknown>
  if (typeof data.signedUrl !== 'string' || !data.signedUrl) {
    throw new WdkCliError('Sign server returned invalid response: missing signedUrl', ErrorCode.SIGN_FAILED)
  }
  return data.signedUrl
}

interface MoonPayUrlConfig {
  apiKey: string
  environment: 'production' | 'sandbox'
}

function buildMoonPayUrl(
  direction: 'buy' | 'sell',
  config: MoonPayUrlConfig,
  cryptoAsset: string,
  address: string,
  fiat?: string,
  fiatAmount?: string,
  cryptoAmount?: string,
): string {
  const origins = direction === 'buy' ? MOONPAY_BUY_ORIGINS : MOONPAY_SELL_ORIGINS
  const url = new URL('/', origins[config.environment])
  url.searchParams.set('apiKey', config.apiKey)

  if (direction === 'buy') {
    url.searchParams.set('currencyCode', cryptoAsset)
    if (fiat) url.searchParams.set('baseCurrencyCode', fiat)
    url.searchParams.set('walletAddress', address)
    if (fiatAmount) url.searchParams.set('baseCurrencyAmount', fiatAmount)
    if (cryptoAmount) url.searchParams.set('quoteCurrencyAmount', cryptoAmount)
  } else {
    url.searchParams.set('baseCurrencyCode', cryptoAsset)
    if (fiat) url.searchParams.set('quoteCurrencyCode', fiat)
    url.searchParams.set('refundWalletAddress', address)
    if (fiatAmount) url.searchParams.set('quoteCurrencyAmount', fiatAmount)
    if (cryptoAmount) url.searchParams.set('baseCurrencyAmount', cryptoAmount)
  }

  return url.toString()
}

interface RampResult {
  direction: 'Buy' | 'Sell'
  network: string
  address: string
  token: string
  module: string
  fiat: string
  fiatAmount?: string
  cryptoAmount?: string
  url: string
}

function printResult(isJson: boolean, result: RampResult): void {
  if (isJson) {
    console.log(JSON.stringify({
      direction: result.direction.toLowerCase(),
      network: result.network,
      address: result.address,
      module: result.module,
      token: result.token,
      fiat: result.fiat,
      ...(result.fiatAmount && { fiatAmount: result.fiatAmount }),
      ...(result.cryptoAmount && { cryptoAmount: result.cryptoAmount }),
      url: result.url,
    }))
  } else {
    console.log()
    console.log(chalk.bold(`${result.direction} Crypto:`))
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
    if (config.signUrl) {
      url = await signMoonPayUrl(url, config.signUrl)
    }

    const label = direction === 'buy' ? 'Buy' : 'Sell' as const
    printResult(isJson, { direction: label, network, address, token, module, fiat: options.fiat!, fiatAmount: options.fiatAmount, cryptoAmount: options.cryptoAmount, url })
  }
}

export function registerRampCommands(program: Command): void {
  program
    .command('buy')
    .description('Buy crypto with fiat via on-ramp provider')
    .option('--wallet <name>', 'Wallet name')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--module <module>', 'Fiat provider module (default: moonpay)', 'moonpay')
    .option('--fiat <currency>', 'Fiat currency code (default: usd)', 'usd')
    .option('--fiat-amount <value>', 'Fiat amount (e.g. 100 for $100)')
    .option('--crypto-amount <value>', 'Crypto amount (e.g. 0.05)')
    .requiredOption('--token <token>', 'Crypto asset code (e.g. usdt, eth, btc)')
    .action(async (options) => {
      try {
        await handleRampAction('buy', options, program)
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  program
    .command('sell')
    .description('Sell crypto for fiat via off-ramp provider')
    .option('--wallet <name>', 'Wallet name')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--module <module>', 'Fiat provider module (default: moonpay)', 'moonpay')
    .option('--fiat <currency>', 'Fiat currency code (default: usd)', 'usd')
    .option('--fiat-amount <value>', 'Fiat amount (e.g. 200 for $200)')
    .option('--crypto-amount <value>', 'Crypto amount (e.g. 50)')
    .requiredOption('--token <token>', 'Crypto asset code (e.g. usdt, eth, btc)')
    .action(async (options) => {
      try {
        await handleRampAction('sell', options, program)
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })
}
