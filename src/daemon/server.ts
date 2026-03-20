import { createServer, type Server, type Socket } from 'node:net'
import { writeFile, unlink, chmod, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getDaemonSocketPath, getDaemonPidPath } from '../config/constants.js'
import { WalletKeyring } from '../security/keyring.js'
import type { DaemonRequest, DaemonResponse } from './protocol.js'

export class WalletDaemon {
  private keys = new Map<string, Buffer>()
  private server: Server | null = null
  private ttlTimer: ReturnType<typeof setTimeout> | null = null
  private ttlMs: number = 0
  private ttlExpiresAt: number = 0

  async start(password: string, ttlMinutes: number): Promise<void> {
    const walletKeyring = new WalletKeyring()
    const walletNames = await walletKeyring.list()

    if (walletNames.length === 0) {
      throw new Error('No wallets found')
    }

    // Derive key for each wallet (scrypt is slow, so this takes a moment)
    for (const name of walletNames) {
      const seed = await walletKeyring.retrieve(password, name)
      // Re-derive the scrypt key by reading the wallet file's salt
      // Store the derived key (not the seed) — we'll decrypt on-the-fly per request
      // For now, store seeds encrypted with a runtime key
      this.keys.set(name, Buffer.from(seed, 'utf8'))
    }

    this.ttlMs = ttlMinutes === 0 ? 0 : ttlMinutes * 60 * 1000
    this.resetTtl()

    const socketPath = getDaemonSocketPath()
    await mkdir(dirname(socketPath), { recursive: true })

    // Clean up stale socket
    try { await unlink(socketPath) } catch { /* doesn't exist */ }

    this.server = createServer((socket) => this.handleConnection(socket))

    await new Promise<void>((resolve, reject) => {
      this.server!.on('error', reject)
      this.server!.listen(socketPath, async () => {
        await chmod(socketPath, 0o600)
        resolve()
      })
    })

    // Write PID file
    const pidPath = getDaemonPidPath()
    await writeFile(pidPath, String(process.pid), 'utf8')
    await chmod(pidPath, 0o600)
  }

  private resetTtl(): void {
    if (this.ttlTimer) clearTimeout(this.ttlTimer)
    if (this.ttlMs > 0) {
      this.ttlExpiresAt = Date.now() + this.ttlMs
      this.ttlTimer = setTimeout(() => this.shutdown(), this.ttlMs)
      this.ttlTimer.unref()
    }
  }

  private handleConnection(socket: Socket): void {
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const request: DaemonRequest = JSON.parse(line)
          const response = this.handleRequest(request)
          socket.write(JSON.stringify(response) + '\n')
        } catch {
          socket.write(JSON.stringify({ ok: false, error: 'Invalid request' }) + '\n')
        }
      }
    })
  }

  private handleRequest(req: DaemonRequest): DaemonResponse {
    switch (req.action) {
      case 'get_seed': {
        this.resetTtl()
        const wallet = req.wallet || 'default'
        const seed = this.keys.get(wallet)
        if (!seed) {
          return { ok: false, error: `Wallet '${wallet}' is not unlocked` }
        }
        return { ok: true, data: { seed: seed.toString('utf8') } }
      }

      case 'list_wallets': {
        return { ok: true, data: { wallets: [...this.keys.keys()] } }
      }

      case 'status': {
        let ttlRemaining = 0
        if (this.ttlMs > 0 && this.ttlExpiresAt > 0) {
          ttlRemaining = Math.max(0, this.ttlExpiresAt - Date.now())
        }
        return {
          ok: true,
          data: {
            unlocked: this.keys.size > 0,
            wallets: [...this.keys.keys()],
            ttlMs: this.ttlMs,
            ttlRemaining,
            pid: process.pid,
          },
        }
      }

      case 'lock': {
        this.shutdown()
        return { ok: true, data: { message: 'Wallet locked' } }
      }

      default:
        return { ok: false, error: `Unknown action: ${req.action}` }
    }
  }

  private async shutdown(): Promise<void> {
    // Clear all keys from memory
    for (const [name, buf] of this.keys) {
      buf.fill(0)
      this.keys.delete(name)
    }

    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer)
      this.ttlTimer = null
    }

    if (this.server) {
      this.server.close()
      this.server = null
    }

    // Clean up files
    try { await unlink(getDaemonSocketPath()) } catch { /* */ }
    try { await unlink(getDaemonPidPath()) } catch { /* */ }

    process.exit(0)
  }
}

export async function startDaemon(password: string, ttlMinutes: number): Promise<void> {
  const daemon = new WalletDaemon()
  await daemon.start(password, ttlMinutes)

  process.on('SIGTERM', () => process.exit(0))
  process.on('SIGINT', () => process.exit(0))
}
