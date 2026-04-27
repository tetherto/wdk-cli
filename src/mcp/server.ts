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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { daemonClient } from '../daemon/client.js'
import { configService } from '../services/config-service.js'
import { convertToUsd } from '../services/price-service.js'
import {
  getAllNetworks,
  getAllNetworkNames,
  validateNetwork,
  getNetworkConfig,
  isTestnet,
} from '../config/networks.js'
import { isIndexerSupported } from '../services/indexer-service.js'
import { APP_VERSION } from '../config/constants.js'
import { formatAmount } from '../ui/formatters.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import type { NetworkName } from '../types/index.js'

function errorResult(error: unknown) {
  if (error instanceof WdkCliError) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: error.message, code: error.code, ...(error.suggestion ? { suggestion: error.suggestion } : {}) }) }], isError: true }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true }
}

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

async function requireWallet(wallet?: string): Promise<string> {
  const resolved = wallet || configService.getDefaultWallet()
  if (!resolved) {
    throw new WdkCliError('No default wallet configured.', ErrorCode.MISSING_CONFIG, 'Set one with: wdk wallet default --name <name>, or pass the wallet parameter.')
  }
  if (!(await daemonClient.isWalletUnlocked(resolved))) {
    throw new WdkCliError(`Wallet '${resolved}' is not unlocked.`, ErrorCode.WALLET_NOT_UNLOCKED, `Run: wdk wallet unlock --name ${resolved}`)
  }
  return resolved
}

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'wdk-wallet',
    version: APP_VERSION,
  })

  server.registerTool(
    'get_networks',
    {
      description: 'List all supported blockchain networks',
      inputSchema: {
        testnet: z.boolean().optional().describe('Filter testnets only'),
        mainnet: z.boolean().optional().describe('Filter mainnets only'),
      },
    },
    async ({ testnet, mainnet }) => {
      const allNetworks = getAllNetworks()
      let names = getAllNetworkNames()

      if (testnet) names = names.filter((n) => isTestnet(n))
      else if (mainnet) names = names.filter((n) => !isTestnet(n))

      const networks = names.map((name) => {
        const config = allNetworks[name]
        return {
          name,
          displayName: config.displayName,
          type: config.type,
          symbol: config.nativeSymbol,
          decimals: config.decimals,
          testnet: isTestnet(name),
          custom: !!config.custom,
        }
      })
      return jsonResult({ networks, count: networks.length })
    },
  )

  server.registerTool(
    'get_address',
    {
      description: 'Get wallet address. Omit network to get addresses for all networks.',
      inputSchema: {
        network: z.string().optional().describe('Network name (e.g. ethereum, bitcoin). Omit for all networks.'),
        index: z.number().optional().default(0).describe('Account index (default: 0)'),
        testnet: z.boolean().optional().default(false).describe('Include testnet addresses when getting all'),
        wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)'),
      },
    },
    async ({ network, index, testnet, wallet }) => {
      try {
        const resolvedWallet = await requireWallet(wallet)

        if (network) {
          validateNetwork(network)
          const address = await daemonClient.getAddress(network, index, resolvedWallet)
          return jsonResult({ network, index, address })
        }

        let names = getAllNetworkNames()
        if (!testnet) names = names.filter((n) => !isTestnet(n))

        const addresses: { network: string; address: string }[] = []
        for (const name of names) {
          try {
            const address = await daemonClient.getAddress(name, index, resolvedWallet)
            addresses.push({ network: name, address })
          } catch { /* skip networks that fail */ }
        }
        return jsonResult({ index, addresses })
      } catch (e) {
        return errorResult(e)
      }
    },
  )

  server.registerTool(
    'get_balance',
    {
      description: 'Get wallet balance. Omit network to get balances for all networks with USD values.',
      inputSchema: {
        network: z.string().optional().describe('Network name. Omit for all networks.'),
        token: z.string().optional().describe('Token contract address for ERC-20/SPL balance'),
        index: z.number().optional().default(0).describe('Account index (default: 0)'),
        testnet: z.boolean().optional().default(false).describe('Include testnets when getting all'),
        wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)'),
      },
    },
    async ({ network, token, index, testnet, wallet }) => {
      try {
        const resolvedWallet = await requireWallet(wallet)

        if (network) {
          validateNetwork(network)
          const result = await daemonClient.getBalance(network, index, token, resolvedWallet)
          const formatted = formatAmount(BigInt(result.balance), result.decimals, result.symbol)
          let usd = 0
          try { usd = await convertToUsd(network as NetworkName, BigInt(result.balance), token) } catch { /* no price */ }
          return jsonResult({ network, index, balance: result.balance, symbol: result.symbol, decimals: result.decimals, formatted, usd })
        }

        let names = getAllNetworkNames()
        if (!testnet) names = names.filter((n) => !isTestnet(n))

        const balances: unknown[] = []
        let totalUsd = 0

        for (const name of names) {
          try {
            const address = await daemonClient.getAddress(name, index, resolvedWallet)
            const result = await daemonClient.getBalance(name, index, undefined, resolvedWallet)
            const formatted = formatAmount(BigInt(result.balance), result.decimals, result.symbol)
            let usd = 0
            try { usd = await convertToUsd(name as NetworkName, BigInt(result.balance)) } catch { /* no price */ }
            totalUsd += usd
            balances.push({ network: name, address, balance: result.balance, symbol: result.symbol, decimals: result.decimals, formatted, usd })
          } catch { /* skip */ }
        }

        return jsonResult({ index, balances, totalUsd: Math.round(totalUsd * 100) / 100 })
      } catch (e) {
        return errorResult(e)
      }
    },
  )

  server.registerTool(
    'get_history',
    {
      description: 'Get transaction history for a network (requires indexer API)',
      inputSchema: {
        network: z.string().describe('Network name (required)'),
        token: z.string().optional().describe('Token filter (e.g. usdt, default: usdt)'),
        limit: z.number().optional().default(30).describe('Max results (default: 30)'),
        index: z.number().optional().default(0).describe('Account index (default: 0)'),
        fromDate: z.string().optional().describe('Start date (ISO 8601, e.g. 2026-01-01)'),
        toDate: z.string().optional().describe('End date (ISO 8601, e.g. 2026-12-31)'),
        wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)'),
      },
    },
    async ({ network, token, limit, index, fromDate, toDate, wallet }) => {
      try {
        const resolvedWallet = await requireWallet(wallet)
        validateNetwork(network)
        if (!isIndexerSupported(network as NetworkName)) {
          throw new WdkCliError(`Network '${network}' is not supported by the indexer API.`, ErrorCode.NETWORK_NOT_SUPPORTED)
        }
        const fromTs = fromDate ? Math.floor(new Date(fromDate).getTime() / 1000) : undefined
        const toTs = toDate ? Math.floor(new Date(toDate).getTime() / 1000) : undefined
        const result = await daemonClient.getHistory(network, token, limit, resolvedWallet, fromTs, toTs)
        return jsonResult({ network, index, ...result })
      } catch (e) {
        return errorResult(e)
      }
    },
  )

  server.registerTool(
    'send_token',
    {
      description: 'Send native tokens or ERC-20/SPL tokens. Returns a dry-run preview by default. Set dryRun=false to execute after reviewing the preview.',
      inputSchema: {
        to: z.string().describe('Recipient address'),
        amount: z.string().describe('Amount in base units (wei, satoshis, lamports)'),
        network: z.string().describe('Network name (e.g. ethereum, bitcoin)'),
        token: z.string().optional().describe('Token contract address (for ERC-20/SPL transfers)'),
        index: z.number().optional().default(0).describe('Account index (default: 0)'),
        dryRun: z.boolean().optional().default(true).describe('Preview transaction without sending (default: true). Set false to execute.'),
        wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)'),
      },
    },
    async ({ to, amount, network, token, index, dryRun, wallet }) => {
      try {
        const resolvedWallet = await requireWallet(wallet)
        validateNetwork(network)

        if (!/^\d+$/.test(amount) || amount === '0') {
          throw new WdkCliError(
            'Invalid amount. Must be a positive integer in base units (wei/satoshis/lamports).',
            ErrorCode.INVALID_AMOUNT,
            'Do not use decimal points. Example: 1000000 for 1 USDT (6 decimals).',
          )
        }

        if (dryRun) {
          const feeQuote = await daemonClient.estimateFee(network, index, to, amount, token, resolvedWallet)
          const config = getNetworkConfig(network as NetworkName)
          let amountUsd = 0
          let feeUsd = 0
          try { amountUsd = await convertToUsd(network as NetworkName, BigInt(amount), token) } catch { /* no price */ }
          try { feeUsd = await convertToUsd(network as NetworkName, BigInt(feeQuote.fee)) } catch { /* no price */ }

          return jsonResult({
            preview: true,
            network,
            networkName: config.displayName,
            to,
            amount,
            amountUsd: Math.round(amountUsd * 100) / 100,
            estimatedFee: feeQuote.fee,
            estimatedFeeFormatted: feeQuote.feeFormatted,
            estimatedFeeUsd: Math.round(feeUsd * 100) / 100,
            message: 'This is a dry-run preview. Call send_token again with dryRun=false to execute.',
          })
        }

        const result = await daemonClient.send(network, index, to, amount, token, resolvedWallet)
        const config = getNetworkConfig(network as NetworkName)

        return jsonResult({
          success: true,
          txHash: result.txHash,
          network,
          from: result.from,
          to: result.to,
          amount: result.amount,
          fee: result.fee,
          feeFormatted: result.fee ? formatAmount(BigInt(result.fee), config.decimals, config.nativeSymbol) : undefined,
        })
      } catch (e) {
        return errorResult(e)
      }
    },
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

