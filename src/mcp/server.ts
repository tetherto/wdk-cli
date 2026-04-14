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
import { convertToUsd } from '../services/price-service.js'
import {
  getAllNetworks,
  getAllNetworkNames,
  isValidNetwork,
  getNetworkConfig,
  isTestnet,
} from '../config/networks.js'
import { APP_VERSION } from '../config/constants.js'
import { configService } from '../services/config-service.js'
import { formatAmount } from '../ui/formatters.js'
import type { NetworkName } from '../types/index.js'

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true }
}

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function validateNetwork(network: string): network is NetworkName {
  if (!isValidNetwork(network)) {
    throw new Error(`Network '${network}' is not supported. Run get_networks to see available networks.`)
  }
  return true
}

async function requireDaemon(): Promise<void> {
  if (!(await daemonClient.isRunning())) {
    throw new Error('Wallet is locked. Please run `wdk wallet unlock` first, then restart the MCP server.')
  }
}

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'wdk-wallet',
    version: APP_VERSION,
  })

  server.tool(
    'get_networks',
    'List all supported blockchain networks',
    {
      testnet: z.boolean().optional().describe('Filter testnets only'),
      mainnet: z.boolean().optional().describe('Filter mainnets only'),
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

  server.tool(
    'get_address',
    'Get wallet address. Omit network to get addresses for all networks.',
    {
      network: z.string().optional().describe('Network name (e.g. ethereum, bitcoin). Omit for all networks.'),
      index: z.number().optional().default(0).describe('Account index (default: 0)'),
      testnet: z.boolean().optional().default(false).describe('Include testnet addresses when getting all'),
      wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)'),
    },
    async ({ network, index, testnet, wallet }) => {
      try {
        await requireDaemon()

        if (network) {
          validateNetwork(network)
          const address = await daemonClient.getAddress(network, index, wallet)
          return jsonResult({ network, index, address })
        }

        let names = getAllNetworkNames()
        if (!testnet) names = names.filter((n) => !isTestnet(n))

        const addresses: { network: string; address: string }[] = []
        for (const name of names) {
          try {
            const address = await daemonClient.getAddress(name, index, wallet)
            addresses.push({ network: name, address })
          } catch { /* skip networks that fail */ }
        }
        return jsonResult({ index, addresses })
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    'get_balance',
    'Get wallet balance. Omit network to get balances for all networks with USD values.',
    {
      network: z.string().optional().describe('Network name. Omit for all networks.'),
      token: z.string().optional().describe('Token contract address for ERC-20/SPL balance'),
      index: z.number().optional().default(0).describe('Account index (default: 0)'),
      testnet: z.boolean().optional().default(false).describe('Include testnets when getting all'),
      wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)'),
    },
    async ({ network, token, index, testnet, wallet }) => {
      try {
        await requireDaemon()

        if (network) {
          validateNetwork(network)
          const result = await daemonClient.getBalance(network, index, token, wallet)
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
            const address = await daemonClient.getAddress(name, index, wallet)
            const result = await daemonClient.getBalance(name, index, undefined, wallet)
            const formatted = formatAmount(BigInt(result.balance), result.decimals, result.symbol)
            let usd = 0
            try { usd = await convertToUsd(name as NetworkName, BigInt(result.balance)) } catch { /* no price */ }
            totalUsd += usd
            balances.push({ network: name, address, balance: result.balance, symbol: result.symbol, decimals: result.decimals, formatted, usd })
          } catch { /* skip */ }
        }

        return jsonResult({ index, balances, totalUsd: Math.round(totalUsd * 100) / 100 })
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    'get_history',
    'Get transaction history for a network',
    {
      network: z.string().describe('Network name (required)'),
      token: z.string().optional().describe('Token filter (e.g. usdt)'),
      limit: z.number().optional().default(20).describe('Max results (default: 20)'),
      wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)'),
    },
    async ({ network, token, limit, wallet }) => {
      try {
        await requireDaemon()
        validateNetwork(network)
        const result = await daemonClient.getHistory(network, token, limit, wallet)
        return jsonResult({ network, ...result })
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    'send_token',
    'Send native tokens or ERC-20/SPL tokens. Returns a preview by default (dry run). Set confirm=true to execute after reviewing the preview.',
    {
      to: z.string().describe('Recipient address'),
      amount: z.string().describe('Amount in base units (wei, satoshis, lamports)'),
      network: z.string().describe('Network name (e.g. ethereum, bitcoin)'),
      token: z.string().optional().describe('Token contract address (for ERC-20/SPL transfers)'),
      index: z.number().optional().default(0).describe('Account index (default: 0)'),
      confirm: z.boolean().optional().default(false).describe('Set true to execute. Default false returns a preview only.'),
      wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)'),
    },
    async ({ to, amount, network, token, index, confirm, wallet }) => {
      try {
        await requireDaemon()
        validateNetwork(network)

        if (!confirm) {
          const feeQuote = await daemonClient.estimateFee(network, index, to, amount, token, wallet)
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
            message: 'This is a preview. Call send_token again with confirm=true to execute.',
          })
        }

        const result = await daemonClient.send(network, index, to, amount, token, wallet)

        return jsonResult({
          success: true,
          txHash: result.txHash,
          network,
          from: result.from,
          to: result.to,
          amount: result.amount,
          fee: result.fee,
        })
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e))
      }
    },
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

