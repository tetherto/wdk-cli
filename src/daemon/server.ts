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
import { getDaemonSocketPath, getDaemonPidPath, getWalletPath } from '../config/constants.js'
import { WalletKeyring } from '../security/keyring.js'
import { deriveKey, decryptWithKey } from '../security/encryption.js'
import { WdkService } from '../services/wdk-service.js'
import { isValidNetwork, getNetworkConfig } from '../config/networks.js'
import { getTokenConfig } from '../config/tokens.js'
import { getTokenTransfers } from '../services/indexer-service.js'
import { enforcePolicies, recordTransaction } from '../services/policy-service.js'
import type { DaemonRequest, DaemonResponse } from './protocol.js'
import type { EncryptedPayload } from '../types/index.js'
import type { NetworkName } from '../types/index.js'

export class WalletDaemon {
  private walletNames: string[] = []
  private wdkInstances = new Map<string, WdkService>()
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

    for (const name of walletNames) {
      const walletPath = getWalletPath(name)
      const data = readFileSync(walletPath, 'utf8')
      const payload: EncryptedPayload = JSON.parse(data)
      const salt = Buffer.from(payload.salt, 'hex')
      const key = deriveKey(password, salt)
      try {
        const seed = decryptWithKey(payload, key)
        const wdk = new WdkService()
        wdk.createInstance(seed)
        this.wdkInstances.set(name, wdk)
        this.walletNames.push(name)
      } catch {
        process.stderr.write(`Warning: Failed to decrypt wallet '${name}' — wrong password or corrupted file\n`)
      } finally {
        key.fill(0)
      }
    }

    if (this.walletNames.length === 0) {
      throw new Error('Failed to decrypt any wallets. Check your password.')
    }

    this.ttlMs = ttlMinutes === 0 ? 0 : ttlMinutes * 60 * 1000
    this.resetTtl()

    const socketPath = getDaemonSocketPath()
    await mkdir(dirname(socketPath), { recursive: true })

    try { await unlink(socketPath) } catch { /* doesn't exist */ }

    this.server = createServer((socket) => this.handleConnection(socket))

    const oldUmask = process.umask(0o077)
    await new Promise<void>((resolve, reject) => {
      this.server!.on('error', reject)
      this.server!.listen(socketPath, () => {
        process.umask(oldUmask)
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

  private async ensureInitialized(network: NetworkName, wallet: string): Promise<WdkService> {
    const wdk = this.wdkInstances.get(wallet)
    if (!wdk) throw new Error(`Wallet '${wallet}' is not unlocked`)

    if (!wdk.isNetworkRegistered(network)) {
      await wdk.registerNetworkPublic(network)
    }
    return wdk
  }

  private handleConnection(socket: Socket): void {
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      if (buffer.length > 65536) {
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
    const wallet = req.wallet || 'default'

    switch (req.action) {
      case 'get_address': {
        this.resetTtl()
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        try {
          const wdk = await this.ensureInitialized(req.network as NetworkName, wallet)
          const account = await wdk.getAccount(req.network as NetworkName, req.index ?? 0)
          const address = await account.getAddress()
          return { ok: true, data: { address } }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }

      case 'get_balance': {
        this.resetTtl()
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        try {
          const wdk = await this.ensureInitialized(req.network as NetworkName, wallet)
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
        this.resetTtl()
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        try {
          const wdk = await this.ensureInitialized(req.network as NetworkName, wallet)
          const account = await wdk.getAccount(req.network as NetworkName, req.index ?? 0)
          const address = await account.getAddress()
          const networkConfig = getNetworkConfig(req.network as NetworkName)
          const token = (req.token || networkConfig.nativeSymbol.toLowerCase()) as 'usdt' | 'usat' | 'xaut' | 'btc'
          const transfers = await getTokenTransfers(req.network as NetworkName, token, address, { limit: req.limit ?? 20 })
          return { ok: true, data: { address, transfers, count: transfers.length } }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }

      case 'estimate_fee': {
        this.resetTtl()
        if (!req.network || !isValidNetwork(req.network) || !req.to || !req.amount) {
          return { ok: false, error: 'Missing required fields: network, to, amount' }
        }
        try {
          const wdk = await this.ensureInitialized(req.network as NetworkName, wallet)
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

          const decimals = networkConfig.decimals
          const divisor = 10n ** BigInt(decimals)
          const whole = fee / divisor
          const remainder = fee % divisor
          const decimal = remainder.toString().padStart(decimals, '0').replace(/0+$/, '') || '0'
          const feeFormatted = `${whole}.${decimal.slice(0, 8)} ${networkConfig.nativeSymbol}`

          return { ok: true, data: { fee: fee.toString(), feeFormatted } }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }

      case 'send': {
        this.resetTtl()
        if (!req.network || !isValidNetwork(req.network) || !req.to || !req.amount) {
          return { ok: false, error: 'Missing required fields: network, to, amount' }
        }
        try {
          const sendOptions = {
            network: req.network as NetworkName,
            index: req.index ?? 0,
            to: req.to,
            amount: req.amount,
            token: req.token,
            wallet,
          }
          const { amountUsd } = await enforcePolicies(sendOptions)

          const wdk = await this.ensureInitialized(req.network as NetworkName, wallet)
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

          recordTransaction(sendOptions, txHash, amountUsd)

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
        return { ok: true, data: { wallets: this.walletNames } }
      }

      case 'status': {
        let ttlRemaining = 0
        if (this.ttlMs > 0 && this.ttlExpiresAt > 0) {
          ttlRemaining = Math.max(0, this.ttlExpiresAt - Date.now())
        }
        return {
          ok: true,
          data: {
            unlocked: this.walletNames.length > 0,
            wallets: this.walletNames,
            ttlMs: this.ttlMs,
            ttlRemaining,
            pid: process.pid,
          },
        }
      }

      case 'lock': {
        setTimeout(() => this.shutdown(), 100)
        return { ok: true, data: { message: 'Wallet locked' } }
      }

      default:
        return { ok: false, error: `Unknown action: ${req.action}` }
    }
  }

  private async shutdown(): Promise<void> {
    for (const [, wdk] of this.wdkInstances) {
      wdk.dispose()
    }
    this.wdkInstances.clear()

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
