export interface TokenConfig {
  address: string
  symbol: string
  decimals: number
}

const TOKENS: Record<string, TokenConfig[]> = {
  ethereum: [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
  ],
  sepolia: [
    { address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', symbol: 'USDT', decimals: 6 },
  ],
  polygon: [
    { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', decimals: 6 },
  ],
  arbitrum: [
    { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
  ],
  bsc: [
    { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
  ],
  avalanche: [
    { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', symbol: 'USDT', decimals: 6 },
  ],
  solana: [
    { address: 'Es9vMFrzaCERmKfrCBhAr1vr7RiS1QWnvNs1mV4cMLqG', symbol: 'USDT', decimals: 6 },
  ],
}

// EVM addresses are case-insensitive; Solana base58 addresses are case-sensitive
const EVM_NETWORKS = new Set(['ethereum', 'sepolia', 'polygon', 'arbitrum', 'bsc', 'avalanche'])

function normalizeAddress(network: string, address: string): string {
  return EVM_NETWORKS.has(network) ? address.toLowerCase() : address
}

// Build a lookup map: network -> normalized address -> TokenConfig
const lookupCache = new Map<string, Map<string, TokenConfig>>()

function getLookup(network: string): Map<string, TokenConfig> {
  let map = lookupCache.get(network)
  if (!map) {
    map = new Map()
    const tokens = TOKENS[network] ?? []
    for (const token of tokens) {
      map.set(normalizeAddress(network, token.address), token)
    }
    lookupCache.set(network, map)
  }
  return map
}

export function getTokenConfig(network: string, address: string): TokenConfig | undefined {
  return getLookup(network).get(normalizeAddress(network, address))
}

export function getKnownTokens(network: string): TokenConfig[] {
  return TOKENS[network] ?? []
}
