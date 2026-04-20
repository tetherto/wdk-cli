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
import { exec } from 'node:child_process'
import { resolveNetwork, resolveIndex } from '../services/wallet-service.js'
import { isValidNetwork, isTestnet } from '../config/networks.js'
import { NetworkNotSupportedError, handleError } from '../errors/index.js'
import { formatNetworkLabel } from '../ui/formatters.js'
import { daemonClient } from '../daemon/client.js'
import { configService } from '../services/config-service.js'
import { getModuleAssets } from '../config/ramp.js'

const SUPPORTED_MODULES = ['moonpay'] as const
type RampModule = typeof SUPPORTED_MODULES[number]

const MOONPAY_BUY_ORIGINS = { production: 'https://buy.moonpay.com', sandbox: 'https://buy-sandbox.moonpay.com' }
const MOONPAY_SELL_ORIGINS = { production: 'https://sell.moonpay.com', sandbox: 'https://sell-sandbox.moonpay.com' }

function openUrl(url: string): void {
  const cmd = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
      ? `start "${url}"`
      : `xdg-open "${url}"`
  exec(cmd)
}

function validateModule(module: string): RampModule {
  if (!SUPPORTED_MODULES.includes(module as RampModule)) {
    throw new Error(`Unsupported module '${module}'. Available: ${SUPPORTED_MODULES.join(', ')}`)
  }
  return module as RampModule
}

function resolveAsset(network: string, token: string, module: RampModule): { code: string; token: string } {
  const assets = getModuleAssets(network, module)
  if (!assets) {
    throw new Error(`Network '${network}' does not support ${module}.`)
  }
  const asset = assets[token.toLowerCase()]
  if (!asset) {
    const supported = Object.keys(assets).join(', ')
    throw new Error(`Token '${token}' on '${network}' is not supported by ${module}. Supported: ${supported}`)
  }
  return { code: asset, token: token.toLowerCase() }
}

function validateEnvironment(network: string, environment: 'production' | 'sandbox'): void {
  if (environment === 'production' && isTestnet(network)) {
    throw new Error(
      `Cannot use production MoonPay with testnet '${network}'. ` +
      `Switch to sandbox: wdk config set moonpay.environment sandbox`
    )
  }
  if (environment === 'sandbox' && !isTestnet(network)) {
    throw new Error(
      `Cannot use sandbox MoonPay with mainnet '${network}'. ` +
      `Switch to production: wdk config set moonpay.environment production`
    )
  }
}

function getMoonPayConfig(): { apiKey: string; signUrl?: string; environment: 'production' | 'sandbox' } {
  const apiKey = configService.get('moonpay.apiKey') as string
  if (!apiKey) {
    throw new Error('MoonPay API key not configured. Run: wdk config set moonpay.apiKey <your-key>')
  }
  const signUrl = configService.get('moonpay.signUrl') as string || undefined
  const environment = ((configService.get('moonpay.environment') as string) || 'sandbox') as 'production' | 'sandbox'
  return { apiKey, signUrl, environment }
}

async function signMoonPayUrl(url: string, signEndpoint: string): Promise<string> {
  const response = await fetch(signEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urlForSignature: url }),
  })
  if (!response.ok) {
    throw new Error(`Failed to sign MoonPay URL: ${response.status} ${response.statusText}`)
  }
  const { signedUrl } = await response.json() as { signedUrl: string }
  return signedUrl
}

function buildMoonPayBuyUrl(
  config: { apiKey: string; environment: 'production' | 'sandbox' },
  cryptoAsset: string,
  address: string,
  fiat?: string,
  fiatAmount?: string,
  cryptoAmount?: string,
): string {
  const base = MOONPAY_BUY_ORIGINS[config.environment]
  const url = new URL('/', base)
  url.searchParams.set('apiKey', config.apiKey)
  url.searchParams.set('currencyCode', cryptoAsset)
  if (fiat) url.searchParams.set('baseCurrencyCode', fiat)
  url.searchParams.set('walletAddress', address)
  if (fiatAmount) url.searchParams.set('baseCurrencyAmount', fiatAmount)
  if (cryptoAmount) url.searchParams.set('quoteCurrencyAmount', cryptoAmount)
  return url.toString()
}

function buildMoonPaySellUrl(
  config: { apiKey: string; environment: 'production' | 'sandbox' },
  cryptoAsset: string,
  address: string,
  fiat?: string,
  fiatAmount?: string,
  cryptoAmount?: string,
): string {
  const base = MOONPAY_SELL_ORIGINS[config.environment]
  const url = new URL('/', base)
  url.searchParams.set('apiKey', config.apiKey)
  url.searchParams.set('baseCurrencyCode', cryptoAsset)
  if (fiat) url.searchParams.set('quoteCurrencyCode', fiat)
  url.searchParams.set('refundWalletAddress', address)
  if (fiatAmount) url.searchParams.set('quoteCurrencyAmount', fiatAmount)
  if (cryptoAmount) url.searchParams.set('baseCurrencyAmount', cryptoAmount)
  return url.toString()
}

function printResult(
  isJson: boolean,
  direction: 'Buy' | 'Sell',
  network: string,
  address: string,
  token: string,
  module: string,
  fiat: string,
  fiatAmount: string | undefined,
  cryptoAmount: string | undefined,
  url: string,
): void {
  if (isJson) {
    console.log(JSON.stringify({ network, address, module, token, url }))
  } else {
    console.log()
    console.log(chalk.bold(`${direction} Crypto:`))
    console.log(`  Network:  ${formatNetworkLabel(network)}`)
    console.log(`  Address:  ${address}`)
    console.log(`  Token:    ${token.toUpperCase()}`)
    console.log(`  Module:   ${module}`)
    console.log(`  Fiat:     ${fiat.toUpperCase()}`)
    if (fiatAmount) console.log(`  Amount:   ${fiatAmount} ${fiat.toUpperCase()}`)
    if (cryptoAmount) console.log(`  Amount:   ${cryptoAmount} ${token.toUpperCase()}`)
    console.log()
    console.log(`  ${chalk.cyan(url)}`)
    console.log()
    openUrl(url)
    console.log(chalk.dim('  Opening in browser...'))
    console.log()
  }
}

export function registerBuySellCommands(program: Command): void {
  program
    .command('buy')
    .description('Buy crypto with fiat via on-ramp provider')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--wallet <name>', 'Wallet name')
    .option('--module <module>', 'Fiat provider module (default: moonpay)', 'moonpay')
    .option('--fiat <currency>', 'Fiat currency code (default: usd)', 'usd')
    .option('--fiat-amount <value>', 'Fiat amount (e.g. 100 for $100)')
    .option('--crypto-amount <value>', 'Crypto amount (e.g. 0.05)')
    .requiredOption('--token <token>', 'Crypto asset code (e.g. usdt, eth, btc)')
    .action(async (options) => {
      try {
        if (options.fiatAmount && options.cryptoAmount) {
          throw new Error('Cannot specify both --fiat-amount and --crypto-amount')
        }

        const module = validateModule(options.module)
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
        const index = resolveIndex(options.index ?? program.opts().index)
        const wallet = options.wallet ?? program.opts().wallet
        const isJson = program.opts().json
        const { code: cryptoAsset, token } = resolveAsset(network, options.token, module)

        if (module === 'moonpay') {
          const config = getMoonPayConfig()
          validateEnvironment(network, config.environment)
          const address = await daemonClient.getAddress(network, index, wallet)

          let buyUrl = buildMoonPayBuyUrl(config, cryptoAsset, address, options.fiat, options.fiatAmount, options.cryptoAmount)
          if (config.signUrl) {
            buyUrl = await signMoonPayUrl(buyUrl, config.signUrl)
          }

          printResult(isJson, 'Buy', network, address, token, module, options.fiat, options.fiatAmount, options.cryptoAmount, buyUrl)
        }
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  program
    .command('sell')
    .description('Sell crypto for fiat via off-ramp provider')
    .option('--network <network>', 'Blockchain network')
    .option('--index <n>', 'Account index')
    .option('--wallet <name>', 'Wallet name')
    .option('--module <module>', 'Fiat provider module (default: moonpay)', 'moonpay')
    .option('--fiat <currency>', 'Fiat currency code (default: usd)', 'usd')
    .option('--fiat-amount <value>', 'Fiat amount (e.g. 200 for $200)')
    .option('--crypto-amount <value>', 'Crypto amount (e.g. 50)')
    .requiredOption('--token <token>', 'Crypto asset code (e.g. usdt, eth, btc)')
    .action(async (options) => {
      try {
        if (options.fiatAmount && options.cryptoAmount) {
          throw new Error('Cannot specify both --fiat-amount and --crypto-amount')
        }

        const module = validateModule(options.module)
        const network = resolveNetwork(options.network ?? program.opts().network)
        if (!isValidNetwork(network)) throw new NetworkNotSupportedError(network)
        const index = resolveIndex(options.index ?? program.opts().index)
        const wallet = options.wallet ?? program.opts().wallet
        const isJson = program.opts().json
        const resolved = resolveAsset(network, options.token, module)

        if (module === 'moonpay') {
          const config = getMoonPayConfig()
          validateEnvironment(network, config.environment)
          const address = await daemonClient.getAddress(network, index, wallet)

          let sellUrl = buildMoonPaySellUrl(config, resolved?.code, address, options.fiat, options.fiatAmount, options.cryptoAmount)
          if (config.signUrl) {
            sellUrl = await signMoonPayUrl(sellUrl, config.signUrl)
          }

          printResult(isJson, 'Sell', network, address, resolved?.token, module, options.fiat, options.fiatAmount, options.cryptoAmount, sellUrl)
        }
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })
}
