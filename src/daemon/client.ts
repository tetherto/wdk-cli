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

import { connect } from 'node:net'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, access, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDaemonSocketPath, getDaemonPidPath } from '../config/constants.js'
import type { DaemonRequest, DaemonResponse } from './protocol.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

function getDaemonScript(): string {
  const thisFile = fileURLToPath(import.meta.url)
  let dir = dirname(thisFile)
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'bin', 'wdk-daemon.mjs')
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }
  throw new Error('Cannot find wdk-daemon.mjs')
}

function spawnDaemon(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', getDaemonScript()], {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true,
    })

    let stderr = ''
    child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    const timeout = setTimeout(() => {
      child.stderr!.destroy()
      child.unref()
      resolve()
    }, 2000)

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to start daemon: ${err.message}`))
    })

    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (code !== 0 && code !== null) {
        reject(new Error(`Daemon exited with code ${code}: ${stderr.trim()}`))
      }
    })
  })
}

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
        try { await unlink(this.socketPath) } catch { /* */ }
        try { await unlink(pidPath) } catch { /* */ }
        return false
      }
    } catch {
      return false
    }
  }

  async ensureRunning(): Promise<void> {
    if (await this.isRunning()) return

    await spawnDaemon()

    let retries = 5
    while (retries > 0) {
      if (await this.isRunning()) {
        try {
          await this.status()
          return
        } catch { /* not ready yet */ }
      }
      await new Promise((r) => setTimeout(r, 500))
      retries--
    }
    throw new Error('Failed to start wallet daemon')
  }

  async request(req: DaemonRequest, timeoutMs: number = 5000): Promise<DaemonResponse> {
    if (!(await this.isRunning())) {
      throw new WdkCliError('Wallet is locked.', ErrorCode.WALLET_LOCKED)
    }

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

      socket.setTimeout(timeoutMs, () => {
        socket.destroy()
        reject(new Error('Daemon request timed out'))
      })
    })
  }

  private assertOk(resp: DaemonResponse, fallbackMsg: string): void {
    if (!resp.ok) throw new Error(resp.error || fallbackMsg)
  }

  async getAddress(network: string, index: number = 0, wallet?: string): Promise<string> {
    const resp = await this.request({ action: 'get_address', network, index, wallet }, 30000)
    this.assertOk(resp, 'Failed to get address')
    return (resp.data as { address: string }).address
  }

  async getBalance(
    network: string,
    index: number = 0,
    token?: string,
    wallet?: string,
  ): Promise<{ balance: string; symbol: string; decimals: number }> {
    const resp = await this.request({ action: 'get_balance', network, index, token, wallet }, 30000)
    this.assertOk(resp, 'Failed to get balance')
    return resp.data as { balance: string; symbol: string; decimals: number }
  }

  async getHistory(
    network: string,
    token?: string,
    limit?: number,
    wallet?: string,
    fromTs?: number,
    toTs?: number,
  ): Promise<{ address: string; transfers: unknown[]; count: number }> {
    const resp = await this.request({ action: 'get_history', network, token, limit, wallet, fromTs, toTs }, 30000)
    this.assertOk(resp, 'Failed to get history')
    return resp.data as { address: string; transfers: unknown[]; count: number }
  }

  async estimateFee(
    network: string,
    index: number,
    to: string,
    amount: string,
    token?: string,
    wallet?: string,
  ): Promise<{ fee: string; feeFormatted: string }> {
    const resp = await this.request({ action: 'estimate_fee', network, index, to, amount, token, wallet }, 30000)
    this.assertOk(resp, 'Failed to estimate fee')
    return resp.data as { fee: string; feeFormatted: string }
  }

  async send(
    network: string,
    index: number,
    to: string,
    amount: string,
    token?: string,
    wallet?: string,
  ): Promise<{ txHash: string; network: string; from: string; to: string; amount: string; fee?: string }> {
    const resp = await this.request({ action: 'send', network, index, to, amount, token, wallet }, 60000)
    this.assertOk(resp, 'Failed to send transaction')
    return resp.data as { txHash: string; network: string; from: string; to: string; amount: string; fee?: string }
  }

  async unlockWallet(name: string, password: string, ttlMinutes: number = 5): Promise<void> {
    const resp = await this.request({ action: 'unlock_wallet', wallet: name, password, ttl: ttlMinutes }, 30000)
    this.assertOk(resp, `Failed to unlock wallet '${name}'`)
  }

  async lockWallet(name: string): Promise<void> {
    const resp = await this.request({ action: 'lock_wallet', wallet: name })
    this.assertOk(resp, `Failed to lock wallet '${name}'`)
  }

  async listWallets(): Promise<{ name: string; ttlMs: number; ttlRemaining: number }[]> {
    const resp = await this.request({ action: 'list_wallets' })
    this.assertOk(resp, 'Failed to list wallets')
    return (resp.data as { wallets: { name: string; ttlMs: number; ttlRemaining: number }[] }).wallets
  }

  async status(): Promise<{ unlocked: boolean; wallets: { name: string; ttlMs: number; ttlRemaining: number }[]; pid: number }> {
    const resp = await this.request({ action: 'status' })
    this.assertOk(resp, 'Failed to get daemon status')
    return resp.data as { unlocked: boolean; wallets: { name: string; ttlMs: number; ttlRemaining: number }[]; pid: number }
  }

  async isWalletUnlocked(wallet: string): Promise<boolean> {
    if (!(await this.isRunning())) return false
    try {
      const status = await this.status()
      return status.wallets.some((w) => w.name === wallet)
    } catch {
      return false
    }
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
