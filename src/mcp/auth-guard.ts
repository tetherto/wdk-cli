import { daemonClient } from '../daemon/client.js'
import { sessionService } from '../services/session-service.js'
import { DEFAULT_WALLET } from '../config/constants.js'

const seedPhraseCache = new Map<string, string>()

export async function requireSession(walletName: string = DEFAULT_WALLET): Promise<string> {
  const cached = seedPhraseCache.get(walletName)
  if (cached) return cached

  // Try daemon first
  try {
    if (await daemonClient.isRunning()) {
      const seed = await daemonClient.getSeed(walletName)
      seedPhraseCache.set(walletName, seed)
      return seed
    }
  } catch { /* daemon not available */ }

  // Fallback to session files
  const seedPhrase = await sessionService.get(walletName)
  if (seedPhrase) {
    seedPhraseCache.set(walletName, seedPhrase)
    return seedPhrase
  }

  throw new McpAuthError('Wallet is locked. Please run `wdk wallet unlock` first, then restart the MCP server.')
}

export class McpAuthError extends Error {
  code = 'WALLET_LOCKED'
  constructor(message: string) {
    super(message)
    this.name = 'McpAuthError'
  }
}
