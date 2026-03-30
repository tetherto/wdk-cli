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

import walletsFile from '../../wdk-config.json' with { type: 'json' }
import { configService } from '../services/config-service.js'

export interface TokenConfig {
  address: string
  symbol: string
  decimals: number
}

const BUILTIN_TOKENS: Record<string, TokenConfig[]> = {}
for (const [name, entry] of Object.entries(walletsFile.networks)) {
  const net = entry as Record<string, unknown>
  if (Array.isArray(net.tokens)) {
    BUILTIN_TOKENS[name] = net.tokens as TokenConfig[]
  }
}

function getAllTokens(network: string): TokenConfig[] {
  if (BUILTIN_TOKENS[network]) return BUILTIN_TOKENS[network]
  const custom = configService.get(`customNetworks.${network}.tokens`) as TokenConfig[] | undefined
  return custom ?? []
}

function normalizeAddress(address: string): string {
  return address.startsWith('0x') ? address.toLowerCase() : address
}

const lookupCache = new Map<string, Map<string, TokenConfig>>()

function getLookup(network: string): Map<string, TokenConfig> {
  let map = lookupCache.get(network)
  if (!map) {
    map = new Map()
    for (const token of getAllTokens(network)) {
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
  return getAllTokens(network)
}
