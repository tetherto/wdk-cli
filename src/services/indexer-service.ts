import { configService } from './config-service.js'
import type { NetworkName } from '../types/index.js'

const BLOCKCHAIN_MAP: Partial<Record<NetworkName, string>> = {
  ethereum: 'ethereum',
  sepolia: 'sepolia',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  tron: 'tron',
  bitcoin: 'bitcoin',
  spark: 'spark',
  'smart-account-ethereum': 'ethereum',
  'smart-account-sepolia': 'sepolia',
  'smart-account-polygon': 'polygon',
  'smart-account-arbitrum': 'arbitrum',
  'smart-account-plasma': 'plasma',
  'smart-account-base': 'base',
}

export type IndexerToken = 'usdt' | 'usat' | 'xaut' | 'btc'

export const INDEXER_TOKENS: IndexerToken[] = ['usdt', 'usat', 'xaut', 'btc']

export interface TokenTransfer {
  blockchain: string
  blockNumber: number
  transactionHash: string
  transferIndex: number
  token: string
  amount: string
  timestamp: number
  transactionIndex: number
  logIndex: number
  from: string
  to: string
  label?: string
}

export function getIndexerBlockchain(network: NetworkName): string | undefined {
  return BLOCKCHAIN_MAP[network]
}

export function isIndexerSupported(network: NetworkName): boolean {
  return network in BLOCKCHAIN_MAP
}

export async function getTokenTransfers(
  network: NetworkName,
  token: IndexerToken,
  address: string,
  options: { limit?: number; fromTs?: number; toTs?: number } = {},
): Promise<TokenTransfer[]> {
  const blockchain = getIndexerBlockchain(network)
  if (!blockchain) {
    throw new Error(`Network '${network}' is not supported by the indexer API.`)
  }

  const baseUrl = configService.get('indexer.baseUrl') as string
  const apiKey = configService.get('indexer.apiKey') as string

  if (!baseUrl) throw new Error('Indexer base URL not configured. Set indexer.baseUrl or WDK_INDEXER_BASE_URL.')

  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.fromTs) params.set('fromTs', String(options.fromTs))
  if (options.toTs) params.set('toTs', String(options.toTs))

  const qs = params.toString() ? `?${params.toString()}` : ''
  const url = `${baseUrl}/api/v1/${blockchain}/${token}/${address}/token-transfers${qs}`

  const headers: Record<string, string> = {}
  if (apiKey) headers['x-api-key'] = apiKey

  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`Indexer API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as { transfers: TokenTransfer[] }
  return data.transfers ?? []
}
