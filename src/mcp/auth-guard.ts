import { sessionService } from '../services/session-service.js'

let seedPhraseCache: string | null = null

/**
 * Session-only auth for MCP server.
 * Unlike auth-service.ts, this NEVER prompts for password — it only uses
 * the existing session. The wallet must be unlocked before starting the MCP server.
 */
export async function requireSession(): Promise<string> {
  if (seedPhraseCache) return seedPhraseCache

  const seedPhrase = await sessionService.get()
  if (!seedPhrase) {
    throw new McpAuthError('Wallet is locked. Please run `wdk wallet unlock` first, then restart the MCP server.')
  }

  seedPhraseCache = seedPhrase
  return seedPhrase
}

export class McpAuthError extends Error {
  code = 'WALLET_LOCKED'
  constructor(message: string) {
    super(message)
    this.name = 'McpAuthError'
  }
}
