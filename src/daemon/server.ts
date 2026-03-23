import { createServer, type Server, type Socket } from 'node:net'
import { readFileSync } from 'node:fs'
import { writeFile, unlink, chmod, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getDaemonSocketPath, getDaemonPidPath, getWalletPath } from '../config/constants.js'
import { WalletKeyring } from '../security/keyring.js'
import { deriveKey, decryptWithKey } from '../security/encryption.js'
import type { DaemonRequest, DaemonResponse } from './protocol.js'
import type { EncryptedPayload } from '../types/index.js'

export class WalletDaemon {
  private derivedKeys = new Map<string, Buffer>()
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

    // Only the derived key is held in RAM — seeds are decrypted on-the-fly per request
    for (const name of walletNames) {
      const walletPath = getWalletPath(name)
      const data = readFileSync(walletPath, 'utf8')
      const payload: EncryptedPayload = JSON.parse(data)
      const salt = Buffer.from(payload.salt, 'hex')
      const key = deriveKey(password, salt)

      decryptWithKey(payload, key)

      this.derivedKeys.set(name, key)
    }

    this.ttlMs = ttlMinutes === 0 ? 0 : ttlMinutes * 60 * 1000
    this.resetTtl()

    const socketPath = getDaemonSocketPath()
    await mkdir(dirname(socketPath), { recursive: true })

    try { await unlink(socketPath) } catch { /* doesn't exist */ }

    this.server = createServer((socket) => this.handleConnection(socket))

    await new Promise<void>((resolve, reject) => {
      this.server!.on('error', reject)
      this.server!.listen(socketPath, async () => {
        await chmod(socketPath, 0o600)
        resolve()
      })
    })

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
        const key = this.derivedKeys.get(wallet)
        if (!key) {
          return { ok: false, error: `Wallet '${wallet}' is not unlocked` }
        }
        // Decrypt on-the-fly — seed only exists in memory briefly
        try {
          const data = readFileSync(getWalletPath(wallet), 'utf8')
          const payload: EncryptedPayload = JSON.parse(data)
          const seed = decryptWithKey(payload, key)
          return { ok: true, data: { seed } }
        } catch (e) {
          return { ok: false, error: `Failed to decrypt wallet '${wallet}'` }
        }
      }

      case 'list_wallets': {
        return { ok: true, data: { wallets: [...this.derivedKeys.keys()] } }
      }

      case 'status': {
        let ttlRemaining = 0
        if (this.ttlMs > 0 && this.ttlExpiresAt > 0) {
          ttlRemaining = Math.max(0, this.ttlExpiresAt - Date.now())
        }
        return {
          ok: true,
          data: {
            unlocked: this.derivedKeys.size > 0,
            wallets: [...this.derivedKeys.keys()],
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
    // Zero-fill all derived keys before clearing
    for (const [name, buf] of this.derivedKeys) {
      buf.fill(0)
      this.derivedKeys.delete(name)
    }

    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer)
      this.ttlTimer = null
    }

    if (this.server) {
      this.server.close()
      this.server = null
    }

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
