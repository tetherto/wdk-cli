import { connect } from 'node:net'
import { readFile, access, unlink } from 'node:fs/promises'
import { getDaemonSocketPath, getDaemonPidPath } from '../config/constants.js'
import type { DaemonRequest, DaemonResponse } from './protocol.js'

export class DaemonClient {
  private socketPath = getDaemonSocketPath()

  async isRunning(): Promise<boolean> {
    try {
      await access(this.socketPath)
      const pidPath = getDaemonPidPath()
      const pid = parseInt(await readFile(pidPath, 'utf8'), 10)
      try {
        process.kill(pid, 0)
        return true
      } catch {
        // PID doesn't exist, clean up stale files
        try { await unlink(this.socketPath) } catch { /* */ }
        try { await unlink(pidPath) } catch { /* */ }
        return false
      }
    } catch {
      return false
    }
  }

  async request(req: DaemonRequest): Promise<DaemonResponse> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.socketPath)
      let buffer = ''

      socket.on('connect', () => {
        socket.write(JSON.stringify(req) + '\n')
      })

      socket.on('data', (chunk) => {
        buffer += chunk.toString()
        const newlineIdx = buffer.indexOf('\n')
        if (newlineIdx !== -1) {
          const line = buffer.slice(0, newlineIdx)
          try {
            resolve(JSON.parse(line))
          } catch {
            reject(new Error('Invalid response from daemon'))
          }
          socket.end()
        }
      })

      socket.on('error', (err) => {
        reject(new Error(`Cannot connect to wallet daemon: ${err.message}`))
      })

      socket.setTimeout(5000, () => {
        socket.destroy()
        reject(new Error('Daemon request timed out'))
      })
    })
  }

  async getSeed(wallet: string = 'default'): Promise<string> {
    const resp = await this.request({ action: 'get_seed', wallet })
    if (!resp.ok) {
      throw new Error(resp.error || 'Failed to get seed from daemon')
    }
    return (resp.data as { seed: string }).seed
  }

  async listWallets(): Promise<string[]> {
    const resp = await this.request({ action: 'list_wallets' })
    if (!resp.ok) {
      throw new Error(resp.error || 'Failed to list wallets')
    }
    return (resp.data as { wallets: string[] }).wallets
  }

  async status(): Promise<{ unlocked: boolean; wallets: string[]; ttlMs: number; pid: number }> {
    const resp = await this.request({ action: 'status' })
    if (!resp.ok) {
      throw new Error(resp.error || 'Failed to get daemon status')
    }
    return resp.data as { unlocked: boolean; wallets: string[]; ttlMs: number; pid: number }
  }

  async lock(): Promise<void> {
    try {
      await this.request({ action: 'lock' })
    } catch {
      // Daemon may have already exited after receiving lock
    }
  }
}

export const daemonClient = new DaemonClient()
