import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { requireSession, McpAuthError } from './auth-guard.js'
import { getAddress, getBalance } from '../services/wallet-service.js'
import { estimateFee, send } from '../services/transaction-service.js'
import { enforcePolicies, getPolicy } from '../services/policy-service.js'
import { recordSpending } from '../services/spending-service.js'
import { getTokenTransfers } from '../services/indexer-service.js'
import { convertToUsd } from '../services/price-service.js'
import {
  getAllNetworks,
  getAllNetworkNames,
  isValidNetwork,
  getNetworkConfig,
  isTestnet,
} from '../config/networks.js'
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

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'wdk-wallet',
    version: '0.0.1',
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
    },
    async ({ network, index, testnet }) => {
      try {
        await requireSession()

        if (network) {
          validateNetwork(network)
          const address = await getAddress(network as NetworkName, index)
          return jsonResult({ network, index, address })
        }

        let names = getAllNetworkNames()
        if (!testnet) names = names.filter((n) => !isTestnet(n))

        const addresses: { network: string; address: string }[] = []
        for (const name of names) {
          try {
            const address = await getAddress(name as NetworkName, index)
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
    'Get wallet balance. Omit network to get balances for all networks with USD totals.',
    {
      network: z.string().optional().describe('Network name. Omit for all networks.'),
      token: z.string().optional().describe('Token contract address for ERC-20/SPL balance'),
      index: z.number().optional().default(0).describe('Account index (default: 0)'),
      testnet: z.boolean().optional().default(false).describe('Include testnets when getting all'),
    },
    async ({ network, token, index, testnet }) => {
      try {
        await requireSession()

        if (network) {
          validateNetwork(network)
          const { balance, symbol, decimals } = await getBalance(network as NetworkName, index, token)
          const formatted = formatBalance(balance, decimals, symbol)
          let usd = 0
          try { usd = await convertToUsd(network as NetworkName, balance, token) } catch { /* no price */ }
          return jsonResult({ network, index, balance: balance.toString(), symbol, decimals, formatted, usd })
        }

        let names = getAllNetworkNames()
        if (!testnet) names = names.filter((n) => !isTestnet(n))

        const balances: unknown[] = []
        let totalUsd = 0

        await Promise.all(names.map(async (name) => {
          try {
            const config = getNetworkConfig(name)
            const address = await getAddress(name as NetworkName, index)
            const { balance, symbol, decimals } = await getBalance(name as NetworkName, index)
            const formatted = formatBalance(balance, decimals, symbol)
            let usd = 0
            try { usd = await convertToUsd(name as NetworkName, balance) } catch { /* no price */ }
            totalUsd += usd
            balances.push({ network: name, address, balance: balance.toString(), symbol, decimals, formatted, usd })
          } catch { /* skip */ }
        }))

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
    },
    async ({ network, token, limit }) => {
      try {
        await requireSession()
        validateNetwork(network)
        const address = await getAddress(network as NetworkName, 0)
        const transfers = await getTokenTransfers(
          network as NetworkName,
          (token || getNetworkConfig(network as NetworkName).nativeSymbol.toLowerCase()) as 'usdt' | 'usat' | 'xaut' | 'btc',
          address,
          { limit },
        )
        return jsonResult({ network, address, transfers, count: transfers.length })
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
    },
    async ({ to, amount, network, token, index, confirm }) => {
      try {
        await requireSession()
        validateNetwork(network)

        const sendOptions = { network: network as NetworkName, index, to, amount, token }
        const { amountUsd } = await enforcePolicies(sendOptions)

        if (!confirm) {
          const feeQuote = await estimateFee(sendOptions)
          const config = getNetworkConfig(network as NetworkName)
          let feeUsd = 0
          try { feeUsd = await convertToUsd(network as NetworkName, feeQuote.fee) } catch { /* no price */ }

          return jsonResult({
            preview: true,
            network,
            networkName: config.displayName,
            to,
            amount,
            amountUsd: Math.round(amountUsd * 100) / 100,
            estimatedFee: feeQuote.fee.toString(),
            estimatedFeeFormatted: feeQuote.feeFormatted,
            estimatedFeeUsd: Math.round(feeUsd * 100) / 100,
            message: 'This is a preview. Call send_token again with confirm=true to execute.',
          })
        }

        const result = await send(sendOptions)
        recordSpending({
          timestamp: Date.now(),
          network,
          to,
          amountUsd,
          token,
          txHash: result.txHash,
        })

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

  server.tool(
    'get_policy',
    'Show current spending policy and daily usage',
    {},
    async () => {
      try {
        const policy = getPolicy()
        return jsonResult({ policy })
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e))
      }
    },
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

function formatBalance(balance: bigint, decimals: number, symbol: string): string {
  const whole = balance / BigInt(10 ** decimals)
  const frac = balance % BigInt(10 ** decimals)
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  const formatted = fracStr ? `${whole}.${fracStr}` : whole.toString()
  return `${formatted} ${symbol}`
}
