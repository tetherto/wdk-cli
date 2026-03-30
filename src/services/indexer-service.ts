import { configService } from './config-service.js'
import type { NetworkName } from '../types/index.js'
import walletsFile from '../../wdk-config.json' with { type: 'json' }

const BLOCKCHAIN_MAP: Record<string, string> = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  const net = entry as Record<string, unknown>
  if (net.indexerBlockchain) {
    BLOCKCHAIN_MAP[name] = net.indexerBlockchain as string
  }
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
    if (response.status === 403) {
      throw new Error(
        `Indexer API error: 403 Forbidden. Please set your API key or use a proxy API for the indexer provider:\n` +
        `  wdk config set indexer.apiKey <your-api-key>\n` +
        `  wdk config set indexer.baseUrl <your-proxy-url>`,
      )
    }
    throw new Error(`Indexer API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as { transfers: TokenTransfer[] }
  return data.transfers ?? []
}
