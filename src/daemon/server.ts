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

import { createServer, type Server, type Socket } from 'node:net'
import { readFileSync } from 'node:fs'
import { writeFile, unlink, chmod, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  getDaemonSocketPath,
  getDaemonPidPath,
  getWalletPath,
  SESSION_TTL_MINUTES,
  DAEMON_MAX_REQUEST_BYTES,
} from '../config/constants.js'
import { configService } from '../services/config-service.js'
import { deriveKey, decryptWithKey } from '../security/encryption.js'
import { WdkService } from '../services/wdk-service.js'
import { isValidNetwork, getNetworkConfig } from '../config/networks.js'
import { getTokenConfig } from '../config/tokens.js'
import { getTokenTransfers, INDEXER_TOKENS, type IndexerToken } from '../services/indexer-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { formatAmount } from '../ui/formatters.js'
import type { DaemonRequest, DaemonResponse } from './protocol.js'
import type { EncryptedPayload } from '../types/index.js'
import type { NetworkName } from '../types/index.js'

interface WalletState {
  wdk: WdkService
  timer: ReturnType<typeof setTimeout> | null
  ttlMs: number
  expiresAt: number
}

export class WalletDaemon {
  private wallets = new Map<string, WalletState>()
  private server: Server | null = null

  async start(): Promise<void> {
    const socketPath = getDaemonSocketPath()
    const isWin = process.platform === 'win32'

    if (!isWin) {
      await mkdir(dirname(socketPath), { recursive: true })
      try { await unlink(socketPath) } catch { /* socket may not exist */ }
    }

    this.server = createServer((socket) => this.handleConnection(socket))

    const oldUmask = isWin ? 0 : process.umask(0o077)
    await new Promise<void>((resolve, reject) => {
      this.server!.on('error', reject)
      this.server!.listen(socketPath, () => {
        if (!isWin) process.umask(oldUmask)
        resolve()
      })
    })

    const pidPath = getDaemonPidPath()
    await writeFile(pidPath, String(process.pid), 'utf8')
    if (!isWin) {
      await chmod(pidPath, 0o600) // owner-only; prevents other users from reading/killing the daemon
    }
  }

  private unlockWalletSync(name: string, passphrase: string, ttlMinutes: number): void {
    // If already unlocked, just reset the timer
    const existing = this.wallets.get(name)
    if (existing) {
      this.resetTimer(name, ttlMinutes)
      return
    }

    const walletPath = getWalletPath(name)
    const data = readFileSync(walletPath, 'utf8')
    const payload: EncryptedPayload = JSON.parse(data)
    const salt = Buffer.from(payload.salt, 'hex')
    const key = deriveKey(passphrase, salt)
    try {
      let seed: string
      try {
        seed = decryptWithKey(payload, key)
      } catch {
        throw new WdkCliError('Incorrect passphrase.', ErrorCode.WRONG_PASSPHRASE)
      }
      const wdk = new WdkService()
      wdk.createInstance(seed)

      const ttlMs = ttlMinutes === 0 ? 0 : ttlMinutes * 60 * 1000
      const state: WalletState = {
        wdk,
        timer: null,
        ttlMs,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
      }
      this.wallets.set(name, state)
      this.startWalletTimer(name, state)
    } finally {
      key.fill(0)
    }
  }

  private resetTimer(name: string, ttlMinutes: number): void {
    const state = this.wallets.get(name)
    if (!state) return

    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }

    state.ttlMs = ttlMinutes === 0 ? 0 : ttlMinutes * 60 * 1000
    state.expiresAt = state.ttlMs > 0 ? Date.now() + state.ttlMs : 0
    this.startWalletTimer(name, state)
  }

  private startWalletTimer(name: string, state: WalletState): void {
    if (state.ttlMs > 0) {
      state.timer = setTimeout(() => {
        this.lockWallet(name)
      }, state.ttlMs)
      state.timer.unref()
    }
  }

  private lockWallet(name: string): void {
    const state = this.wallets.get(name)
    if (!state) return

    if (state.timer) {
      clearTimeout(state.timer)
    }
    state.wdk.dispose()
    this.wallets.delete(name)

    // Auto-exit when no wallets remain
    if (this.wallets.size === 0) {
      this.shutdown()
    }
  }

  private requireWallet(wallet: string): WdkService {
    const state = this.wallets.get(wallet)
    if (!state) throw new WdkCliError(`Wallet '${wallet}' is not unlocked.`, ErrorCode.WALLET_NOT_UNLOCKED, `Run: wdk wallet unlock --name ${wallet}`)
    return state.wdk
  }

  private getWalletStatusList(): { name: string; ttlMs: number; ttlRemaining: number }[] {
    return [...this.wallets.entries()].map(([name, state]) => {
      const ttlRemaining = state.ttlMs > 0 && state.expiresAt > 0
        ? Math.max(0, state.expiresAt - Date.now())
        : 0
      return { name, ttlMs: state.ttlMs, ttlRemaining }
    })
  }

  private handleConnection(socket: Socket): void {
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      if (buffer.length > DAEMON_MAX_REQUEST_BYTES) {
        socket.write(JSON.stringify({ ok: false, error: 'Message too large' }) + '\n')
        socket.destroy()
        return
      }
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const request: DaemonRequest = JSON.parse(line)
          this.handleRequest(request).then((response) => {
            socket.write(JSON.stringify(response) + '\n')
          }).catch(() => {
            socket.write(JSON.stringify({ ok: false, error: 'Internal error' }) + '\n')
          })
        } catch {
          socket.write(JSON.stringify({ ok: false, error: 'Invalid request' }) + '\n')
        }
      }
    })
  }

  private async handleRequest(req: DaemonRequest): Promise<DaemonResponse> {
    const wallet = req.wallet || configService.getDefaultWallet()

    switch (req.action) {
      case 'unlock_wallet': {
        if (!wallet) {
          return { ok: false, error: 'Missing wallet name' }
        }
        if (req.passphrase == null) {
          return { ok: false, error: 'Missing passphrase' }
        }
        try {
          const ttl = req.ttl ?? SESSION_TTL_MINUTES
          this.unlockWalletSync(wallet, req.passphrase, ttl)
          return { ok: true, data: { message: `Wallet '${wallet}' unlocked`, wallet } }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }

      case 'lock_wallet': {
        if (!wallet) {
          return { ok: false, error: 'Missing wallet name' }
        }
        if (!this.wallets.has(wallet)) {
          return { ok: false, error: `Wallet '${wallet}' is not unlocked` }
        }
        this.lockWallet(wallet)
        return { ok: true, data: { message: `Wallet '${wallet}' locked`, wallet } }
      }

      case 'get_address': {
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        try {
          const wdk = this.requireWallet(wallet)
          const account = await wdk.getAccount(req.network as NetworkName, req.index ?? 0)
          const address = await account.getAddress()
          return { ok: true, data: { address } }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }

      case 'get_balance': {
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        try {
          const wdk = this.requireWallet(wallet)
          const networkConfig = getNetworkConfig(req.network as NetworkName)
          const account = await wdk.getAccount(req.network as NetworkName, req.index ?? 0)

          if (req.token) {
            const balance: bigint = await account.getTokenBalance(req.token)
            const config = getTokenConfig(req.network as NetworkName, req.token)
            return {
              ok: true,
              data: {
                balance: balance.toString(),
                symbol: config?.symbol || 'tokens',
                decimals: config?.decimals || 0,
              },
            }
          }

          const balance: bigint = await account.getBalance()
          return {
            ok: true,
            data: {
              balance: balance.toString(),
              symbol: networkConfig.nativeSymbol,
              decimals: networkConfig.decimals,
            },
          }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }

      case 'get_history': {
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        try {
          const wdk = this.requireWallet(wallet)
          const account = await wdk.getAccount(req.network as NetworkName, req.index ?? 0)
          const address = await account.getAddress()
          const networkConfig = getNetworkConfig(req.network as NetworkName)
          const tokenInput = req.token || networkConfig.nativeSymbol.toLowerCase()
          if (!(INDEXER_TOKENS as readonly string[]).includes(tokenInput)) {
            return { ok: false, error: `Invalid token '${tokenInput}'. Valid: ${INDEXER_TOKENS.join(', ')}` }
          }
          const token = tokenInput as IndexerToken
          const transfers = await getTokenTransfers(req.network as NetworkName, token, address, { limit: req.limit ?? 30, fromTs: req.fromTs, toTs: req.toTs })
          return { ok: true, data: { address, transfers, count: transfers.length } }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }

      case 'estimate_fee': {
        if (!req.network || !isValidNetwork(req.network) || !req.to || !req.amount) {
          return { ok: false, error: 'Missing required fields: network, to, amount' }
        }
        try {
          const wdk = this.requireWallet(wallet)
          const networkConfig = getNetworkConfig(req.network as NetworkName)
          const account = await wdk.getAccount(req.network as NetworkName, req.index ?? 0)

          let fee: bigint
          if (req.token) {
            const quote = await account.quoteTransfer({
              token: req.token,
              recipient: req.to,
              amount: BigInt(req.amount),
            })
            fee = quote.fee
          } else {
            const quote = await account.quoteSendTransaction({
              to: req.to,
              value: BigInt(req.amount),
            })
            fee = quote.fee
          }

          const feeFormatted = formatAmount(fee, networkConfig.decimals, networkConfig.nativeSymbol)

          return { ok: true, data: { fee: fee.toString(), feeFormatted } }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }

      case 'send': {
        if (!req.network || !isValidNetwork(req.network) || !req.to || !req.amount) {
          return { ok: false, error: 'Missing required fields: network, to, amount' }
        }
        try {
          const wdk = this.requireWallet(wallet)
          const networkConfig = getNetworkConfig(req.network as NetworkName)
          const account = await wdk.getAccount(req.network as NetworkName, req.index ?? 0)
          const sendAmount = BigInt(req.amount)

          let txHash: string
          let from: string
          let fee: string | undefined

          if (req.token) {
            const tokenBalance = await account.getTokenBalance(req.token)
            if (tokenBalance < sendAmount) {
              return { ok: false, error: `Insufficient token balance: ${tokenBalance} < ${sendAmount}` }
            }
            const result = await account.transfer({
              token: req.token,
              recipient: req.to,
              amount: sendAmount,
            })
            txHash = result.hash
            from = await account.getAddress()
            fee = result.fee?.toString()
          } else {
            const balance = await account.getBalance()
            if (balance < sendAmount) {
              return { ok: false, error: `Insufficient balance: ${balance} ${networkConfig.nativeSymbol} < ${sendAmount}` }
            }

            const result = await account.sendTransaction({
              to: req.to,
              value: sendAmount,
            })
            txHash = result.hash
            from = await account.getAddress()
            fee = result.fee?.toString()
          }

          return {
            ok: true,
            data: {
              txHash,
              network: req.network,
              from,
              to: req.to,
              amount: req.amount,
              fee,
            },
          }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }

      case 'list_wallets': {
        return { ok: true, data: { wallets: this.getWalletStatusList() } }
      }

      case 'status': {
        return {
          ok: true,
          data: {
            unlocked: this.wallets.size > 0,
            wallets: this.getWalletStatusList(),
            pid: process.pid,
          },
        }
      }

      case 'lock': {
        setTimeout(() => this.shutdown(), 100)
        return { ok: true, data: { message: 'All wallets locked' } }
      }

      default:
        return { ok: false, error: `Unknown action: ${req.action}` }
    }
  }

  async shutdown(): Promise<void> {
    for (const [, state] of this.wallets) {
      if (state.timer) clearTimeout(state.timer)
      state.wdk.dispose()
    }
    this.wallets.clear()

    if (this.server) {
      this.server.close()
      this.server = null
    }

    // Only unlink socket on Unix; on Windows the pipe vanishes with the process
    if (process.platform !== 'win32') {
      try { await unlink(getDaemonSocketPath()) } catch { /* */ }
    }
    try { await unlink(getDaemonPidPath()) } catch { /* */ }

    process.exit(0)
  }
}

export async function startDaemon(): Promise<void> {
  const daemon = new WalletDaemon()
  await daemon.start()

  const handleSignal = () => { void daemon.shutdown() }
  process.on('SIGTERM', handleSignal)
  process.on('SIGINT', handleSignal)
  // On Windows, SIGTERM is not supported; listen for SIGHUP as a fallback
  if (process.platform === 'win32') {
    process.on('SIGHUP', handleSignal)
  }
}
