import walletsFile from '../../wdk-config.json' with { type: 'json' }

export interface TokenConfig {
  address: string
  symbol: string
  decimals: number
}

const TOKENS: Record<string, TokenConfig[]> = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  const net = entry as Record<string, unknown>
  if (Array.isArray(net.tokens)) {
    TOKENS[name] = net.tokens as TokenConfig[]
  }
}

function normalizeAddress(address: string): string {
  return address.startsWith('0x') ? address.toLowerCase() : address
}

const lookupCache = new Map<string, Map<string, TokenConfig>>()

function getLookup(network: string): Map<string, TokenConfig> {
  let map = lookupCache.get(network)
  if (!map) {
    map = new Map()
    const tokens = TOKENS[network] ?? []
    for (const token of tokens) {
      map.set(normalizeAddress(token.address), token)
    }
    lookupCache.set(network, map)
  }
  return map
}

export function getTokenConfig(network: string, address: string): TokenConfig | undefined {
  return getLookup(network).get(normalizeAddress(address))
}

export function getKnownTokens(network: string): TokenConfig[] {
  return TOKENS[network] ?? []
}
