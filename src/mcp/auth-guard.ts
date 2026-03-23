import { daemonClient } from '../daemon/client.js'

export async function requireDaemon(): Promise<void> {
  if (!(await daemonClient.isRunning())) {
    throw new McpAuthError('Wallet is locked. Please run `wdk wallet unlock` first, then restart the MCP server.')
  }
}

export class McpAuthError extends Error {
  code = 'WALLET_LOCKED'
  constructor(message: string) {
    super(message)
    this.name = 'McpAuthError'
  }
}
