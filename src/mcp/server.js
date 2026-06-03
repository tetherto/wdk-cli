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
import { APP_VERSION } from '../config/constants.js'
import { WdkCliError } from '../errors/index.js'
import { listNetworks } from '../actions/networks.js'
import { getBalance, getAllBalances } from '../actions/balance.js'
import { getAddress, getAllAddresses } from '../actions/address.js'
import { getHistory } from '../actions/history.js'
import { previewSend, executeSend } from '../actions/send.js'
import { createRampUrl } from '../actions/ramp.js'
import { listTokens, getToken } from '../actions/token.js'
import { resolveTokenIdentifier } from '../services/token-service.js'

/** @typedef {{ content: Array<{ type: 'text', text: string }>, isError?: boolean }} ToolResult */

/**
 * @param {unknown} error
 * @returns {ToolResult}
 */
function errorResult (error) {
  if (error instanceof WdkCliError) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            code: error.code,
            ...(error.suggestion ? { suggestion: error.suggestion } : {})
          })
        }
      ],
      isError: true
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true }
}

/**
 * @param {unknown} data
 * @returns {ToolResult}
 */
function jsonResult (data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

/**
 * Starts the MCP server over stdio, registering all WDK wallet tools.
 *
 * @returns {Promise<void>}
 */
export async function startMcpServer () {
  const server = new McpServer({
    name: 'wdk-wallet',
    version: APP_VERSION
  })

  server.registerTool(
    'get_networks',
    {
      description: 'List all supported blockchain networks',
      inputSchema: {
        testnet: z.boolean().optional().describe('Filter testnets only'),
        mainnet: z.boolean().optional().describe('Filter mainnets only')
      }
    },
    async ({ testnet, mainnet }) => {
      return jsonResult(listNetworks({ testnet, mainnet }))
    }
  )

  server.registerTool(
    'list_tokens',
    {
      description:
        'List registered tokens. Omit network to return every token across all networks.',
      inputSchema: {
        network: z.string().optional().describe('Filter to a single network')
      }
    },
    async ({ network }) => {
      try {
        return jsonResult(listTokens({ network }))
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  server.registerTool(
    'get_token',
    {
      description: 'Get the full registry entry for a single token (network + token).',
      inputSchema: {
        network: z.string().describe('Network name (e.g. ethereum)'),
        token: z.string().describe('Token (e.g. usdt)')
      }
    },
    async ({ network, token }) => {
      try {
        return jsonResult(getToken({ network, token }))
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  server.registerTool(
    'get_address',
    {
      description: 'Get wallet address. Omit network to get addresses for all networks.',
      inputSchema: {
        network: z
          .string()
          .optional()
          .describe('Network name (e.g. ethereum, bitcoin). Omit for all networks.'),
        index: z.number().optional().default(0).describe('Account index (default: 0)'),
        testnet: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include testnet addresses when getting all'),
        wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)')
      }
    },
    async ({ network, index, testnet, wallet }) => {
      try {
        if (network) {
          const result = await getAddress({ network, index, wallet })
          return jsonResult(result)
        }
        const result = await getAllAddresses({ index, testnet, wallet })
        return jsonResult(result)
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  server.registerTool(
    'get_balance',
    {
      description:
        'Get wallet balance. Omit network to get balances for all networks with USD values.',
      inputSchema: {
        network: z.string().optional().describe('Network name. Omit for all networks.'),
        token: z
          .string()
          .optional()
          .describe('Registered token (e.g. usdt), omit for native. Use the token tool to list available ones.'),
        index: z.number().optional().default(0).describe('Account index (default: 0)'),
        testnet: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include testnets when getting all'),
        wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)')
      }
    },
    async ({ network, token, index, testnet, wallet }) => {
      try {
        if (network) {
          let tokenArg
          if (token) {
            const resolved = resolveTokenIdentifier(network, token)
            tokenArg = resolved.isNative ? undefined : resolved.address
          }
          const result = await getBalance({ network, index, token: tokenArg, wallet })
          return jsonResult(result)
        }
        const result = await getAllBalances({ index, testnet, wallet })
        return jsonResult(result)
      } catch (e) {
        return errorResult(e)
      }
    }
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
        wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)')
      }
    },
    async ({ network, token, limit, index, fromDate, toDate, wallet }) => {
      try {
        const result = await getHistory({ network, index, token, limit, fromDate, toDate, wallet })
        return jsonResult(result)
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  server.registerTool(
    'send_token',
    {
      description:
        'Send native tokens or ERC-20/SPL tokens. IMPORTANT: Always call with dryRun=true first to preview fees and amounts, show the preview to the user, and only call again with dryRun=false after user confirms.',
      inputSchema: {
        to: z.string().describe('Recipient address'),
        amount: z.string().describe('Amount in base units (wei, satoshis, lamports)'),
        network: z.string().describe('Network name (e.g. ethereum, bitcoin)'),
        token: z
          .string()
          .optional()
          .describe('Registered token (e.g. usdt), omit for native. Use the token tool to list available ones.'),
        index: z.number().optional().default(0).describe('Account index (default: 0)'),
        dryRun: z
          .boolean()
          .optional()
          .default(true)
          .describe('Preview transaction without sending (default: true). Set false to execute.'),
        wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)')
      }
    },
    async ({ to, amount, network, token, index, dryRun, wallet }) => {
      try {
        let tokenArg
        if (token) {
          const resolved = resolveTokenIdentifier(network, token)
          tokenArg = resolved.isNative ? undefined : resolved.address
        }
        const sendInput = { network, index, to, amount, token: tokenArg, wallet }
        if (dryRun) {
          const preview = await previewSend(sendInput)
          return jsonResult({
            preview: true,
            ...preview,
            message:
              'This is a dry-run preview. Call send_token again with dryRun=false to execute.'
          })
        }
        const result = await executeSend(sendInput)
        return jsonResult({ success: true, ...result })
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  const rampInputSchema = {
    network: z.string().describe('Network name (e.g. ethereum, bitcoin)'),
    token: z.string().describe('Crypto asset code (e.g. usdt, eth, btc)'),
    fiatCurrency: z
      .string()
      .optional()
      .default('usd')
      .describe('Fiat currency code (default: usd)'),
    fiatAmount: z
      .string()
      .optional()
      .describe('Fiat amount (e.g. 100 for $100). Mutually exclusive with cryptoAmount.'),
    cryptoAmount: z
      .string()
      .optional()
      .describe('Crypto amount (e.g. 0.05). Mutually exclusive with fiatAmount.'),
    index: z.number().optional().default(0).describe('Account index (default: 0)'),
    wallet: z.string().optional().describe('Wallet name (uses default wallet if omitted)')
  }

  async function handleRamp (
    direction,
    { network, token, fiatCurrency, fiatAmount, cryptoAmount, index, wallet }
  ) {
    try {
      const result = await createRampUrl({
        direction,
        network,
        index,
        token,
        fiatCurrency,
        fiatAmount,
        cryptoAmount,
        wallet
      })
      const action = direction === 'buy' ? 'Buy' : 'Sell'
      /** @type {ToolResult} */
      const toolResult = {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) },
          { type: 'text', text: `[Open ${action} ${result.token.toUpperCase()} on provider](${result.url})` }
        ]
      }
      return toolResult
    } catch (e) {
      return errorResult(e)
    }
  }

  server.registerTool(
    'buy_crypto',
    {
      description:
        'Buy crypto with fiat via on-ramp provider. Returns a signed URL for the user to open.',
      inputSchema: rampInputSchema
    },
    (args) => handleRamp('buy', args)
  )

  server.registerTool(
    'sell_crypto',
    {
      description:
        'Sell crypto for fiat via off-ramp provider. Returns a signed URL for the user to open.',
      inputSchema: rampInputSchema
    },
    (args) => handleRamp('sell', args)
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
