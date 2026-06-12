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

import { createServer } from 'node:net'
import { readFileSync } from 'node:fs'
import { writeFile, unlink, chmod, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { mnemonicToSeedSync } from 'bip39'
import {
  getDaemonSocketPath,
  getDaemonPidPath,
  getWalletPath,
  SESSION_TTL_MINUTES,
  DAEMON_MAX_REQUEST_BYTES
} from '../config/constants.js'
import { configService } from '../services/config-service.js'
import { deriveKey, decryptWithKey } from '../security/encryption.js'
import { WdkService } from '../services/wdk-service.js'
import { isValidNetwork, getNetworkConfig } from '../config/networks.js'
import { getTokenByAddress } from '../services/token-service.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { formatAmount } from '../ui/formatters.js'

/** @typedef {import('./protocol.js').DaemonRequest} DaemonRequest */
/** @typedef {import('./protocol.js').DaemonResponse} DaemonResponse */
/** @typedef {import('./protocol.js').WalletStatus} WalletStatus */
/** @typedef {import('node:net').Server} Server */
/** @typedef {import('node:net').Socket} Socket */

/**
 * @typedef {Object} WalletState
 * @property {WdkService} wdk - The WDK service instance for this wallet.
 * @property {ReturnType<typeof setTimeout> | null} timer - The auto-lock timer handle.
 * @property {number} ttlMs - The session TTL in milliseconds (0 = no expiry).
 * @property {number} expiresAt - The Unix timestamp (ms) when the session expires (0 = no expiry).
 */

/**
 * Builds a failure DaemonResponse that preserves the error code across IPC.
 * Picks up `code` and `suggestion` from WdkCliError, plus `code` from
 * third-party errors (blockchain rpc, Node syscalls) that carry a string code.
 *
 * @param {unknown} e - The thrown value to serialize.
 * @returns {DaemonResponse} A failure response with as much error context preserved as possible.
 */
function errorResponse (e) {
  if (!(e instanceof Error)) return { ok: false, error: String(e) }
  const err = /** @type {Error & { code?: unknown, suggestion?: unknown }} */ (e)
  return {
    ok: false,
    error: err.message,
    ...(typeof err.code === 'string' ? { code: err.code } : {}),
    ...(typeof err.suggestion === 'string' ? { suggestion: err.suggestion } : {})
  }
}

/**
 * Long-lived wallet daemon. Holds unlocked WDK instances in memory and serves
 * CLI/MCP requests over a local IPC endpoint (Unix domain socket on
 * macOS/Linux, named pipe on Windows).
 */
export class WalletDaemon {
  /** @type {Map<string, WalletState>} */
  #wallets = new Map()
  /** @type {Server | null} */
  #server = null

  /**
   * Starts the daemon: creates the IPC endpoint (Unix domain socket on
   * macOS/Linux, named pipe on Windows), writes the PID file, and begins
   * accepting connections. Access is restricted to the current user on both
   * platforms (umask 0o077 on Unix, default per-user ACL on Windows).
   *
   * @returns {Promise<void>}
   */
  async start () {
    const socketPath = getDaemonSocketPath()
    const isWin = process.platform === 'win32'

    if (!isWin) {
      await mkdir(dirname(socketPath), { recursive: true })
      try {
        await unlink(socketPath)
      } catch {
        /* socket may not exist */
      }
    }

    this.#server = createServer((socket) => this.#handleConnection(socket))

    const oldUmask = isWin ? 0 : process.umask(0o077)
    await new Promise((resolve, reject) => {
      this.#server.on('error', reject)
      this.#server.listen(socketPath, () => {
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

  /**
   * Synchronously decrypts and loads a wallet into the in-memory session map.
   *
   * @param {string} name - The wallet name.
   * @param {string} passphrase - The wallet passphrase.
   * @param {number} ttlMinutes - The session TTL in minutes (0 = no expiry).
   * @returns {void}
   */
  #unlockWalletSync (name, passphrase, ttlMinutes) {
    // If already unlocked, just reset the timer
    const existing = this.#wallets.get(name)
    if (existing) {
      this.#resetTimer(name, ttlMinutes)
      return
    }

    const walletPath = getWalletPath(name)
    const data = readFileSync(walletPath, 'utf8')
    const payload = JSON.parse(data)
    const salt = Buffer.from(payload.salt, 'hex')
    const key = deriveKey(passphrase, salt)
    try {
      let seedPhrase
      try {
        seedPhrase = decryptWithKey(payload, key)
      } catch {
        throw new WdkCliError('Incorrect passphrase.', ErrorCode.WRONG_PASSPHRASE)
      }
      // Buffer (not the immutable mnemonic string) so the seed can be zeroed on lock.
      const seedBuffer = mnemonicToSeedSync(seedPhrase)
      const wdk = new WdkService()
      wdk.createInstance(seedBuffer)

      const ttlMs = ttlMinutes === 0 ? 0 : ttlMinutes * 60 * 1000
      const state = {
        wdk,
        timer: null,
        ttlMs,
        expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0
      }
      this.#wallets.set(name, state)
      this.#startWalletTimer(name, state)
    } finally {
      key.fill(0)
    }
  }

  /**
   * Resets the auto-lock timer for an already-unlocked wallet.
   *
   * @param {string} name - The wallet name.
   * @param {number} ttlMinutes - The new TTL in minutes (0 = no expiry).
   * @returns {void}
   */
  #resetTimer (name, ttlMinutes) {
    const state = this.#wallets.get(name)
    if (!state) return

    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }

    state.ttlMs = ttlMinutes === 0 ? 0 : ttlMinutes * 60 * 1000
    state.expiresAt = state.ttlMs > 0 ? Date.now() + state.ttlMs : 0
    this.#startWalletTimer(name, state)
  }

  /**
   * Starts an auto-lock timer for the given wallet state.
   *
   * @param {string} name - The wallet name.
   * @param {WalletState} state - The wallet session state.
   * @returns {void}
   */
  #startWalletTimer (name, state) {
    if (state.ttlMs > 0) {
      state.timer = setTimeout(() => {
        this.#lockWallet(name)
      }, state.ttlMs)
      state.timer.unref()
    }
  }

  /**
   * Locks and disposes a wallet session, auto-shutting down if no sessions remain.
   *
   * @param {string} name - The wallet name.
   * @returns {void}
   */
  #lockWallet (name) {
    const state = this.#wallets.get(name)
    if (!state) return

    if (state.timer) {
      clearTimeout(state.timer)
    }
    state.wdk.dispose()
    this.#wallets.delete(name)

    // Auto-exit when no wallets remain
    if (this.#wallets.size === 0) {
      this.shutdown()
    }
  }

  /**
   * Returns the WdkService for an unlocked wallet, throwing if not unlocked.
   *
   * @param {string} wallet - The wallet name.
   * @returns {WdkService} The WDK service instance.
   */
  #requireWallet (wallet) {
    const state = this.#wallets.get(wallet)
    if (!state) {
      throw new WdkCliError(
        `Wallet '${wallet}' is not unlocked.`,
        ErrorCode.WALLET_NOT_UNLOCKED,
        `Run: wdk wallet unlock --name ${wallet}`
      )
    }
    return state.wdk
  }

  /**
   * Returns a status list for all currently unlocked wallets.
   *
   * @returns {WalletStatus[]} Array of wallet status entries.
   */
  #getWalletStatusList () {
    return [...this.#wallets.entries()].map(([name, state]) => {
      const ttlRemaining =
        state.ttlMs > 0 && state.expiresAt > 0 ? Math.max(0, state.expiresAt - Date.now()) : 0
      return { name, ttlMs: state.ttlMs, ttlRemaining }
    })
  }

  /**
   * Handles a new incoming socket connection, reading newline-delimited JSON requests.
   *
   * @param {Socket} socket - The connected socket.
   * @returns {void}
   */
  #handleConnection (socket) {
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
          const request = JSON.parse(line)
          this.#handleRequest(request)
            .then((response) => {
              socket.write(JSON.stringify(response) + '\n')
            })
            .catch(() => {
              socket.write(JSON.stringify({ ok: false, error: 'Internal error' }) + '\n')
            })
        } catch {
          socket.write(JSON.stringify({ ok: false, error: 'Invalid request' }) + '\n')
        }
      }
    })
  }

  /**
   * Dispatches a parsed daemon request to the appropriate handler and returns the response.
   *
   * @param {DaemonRequest} req - The parsed request object.
   * @returns {Promise<DaemonResponse>} The response to send back to the client.
   */
  async #handleRequest (req) {
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
          this.#unlockWalletSync(wallet, req.passphrase, ttl)
          return { ok: true, data: { message: `Wallet '${wallet}' unlocked`, wallet } }
        } catch (e) {
          return errorResponse(e)
        }
      }

      case 'lock_wallet': {
        if (!wallet) {
          return { ok: false, error: 'Missing wallet name' }
        }
        if (!this.#wallets.has(wallet)) {
          return { ok: false, error: `Wallet '${wallet}' is not unlocked` }
        }
        this.#lockWallet(wallet)
        return { ok: true, data: { message: `Wallet '${wallet}' locked`, wallet } }
      }

      case 'get_address': {
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        try {
          const wdk = this.#requireWallet(wallet)
          const account = await wdk.getAccount(req.network, req.index ?? 0)
          const address = await account.getAddress()
          return { ok: true, data: { address } }
        } catch (e) {
          return errorResponse(e)
        }
      }

      case 'get_balance': {
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        try {
          const wdk = this.#requireWallet(wallet)
          const networkConfig = getNetworkConfig(req.network)
          const account = await wdk.getAccount(req.network, req.index ?? 0)

          if (req.token) {
            const balance = await account.getTokenBalance(req.token)
            const tokenInfo = getTokenByAddress(req.network, req.token)
            return {
              ok: true,
              data: {
                balance: balance.toString(),
                symbol: tokenInfo?.symbol || 'tokens',
                decimals: tokenInfo?.decimals || 0
              }
            }
          }

          const balance = await account.getBalance()
          return {
            ok: true,
            data: {
              balance: balance.toString(),
              symbol: networkConfig.nativeSymbol,
              decimals: networkConfig.decimals
            }
          }
        } catch (e) {
          return errorResponse(e)
        }
      }

      case 'estimate_fee': {
        if (!req.network || !isValidNetwork(req.network) || !req.to || !req.amount) {
          return { ok: false, error: 'Missing required fields: network, to, amount' }
        }
        try {
          const wdk = this.#requireWallet(wallet)
          const networkConfig = getNetworkConfig(req.network)
          const account = await wdk.getAccount(req.network, req.index ?? 0)

          let fee
          if (req.token) {
            const quote = await account.quoteTransfer({
              token: req.token,
              recipient: req.to,
              amount: BigInt(req.amount)
            })
            fee = quote.fee
          } else {
            const quote = await account.quoteSendTransaction({
              to: req.to,
              value: BigInt(req.amount)
            })
            fee = quote.fee
          }

          const feeFormatted = formatAmount(fee, networkConfig.decimals, networkConfig.nativeSymbol)

          return { ok: true, data: { fee: fee.toString(), feeFormatted } }
        } catch (e) {
          return errorResponse(e)
        }
      }

      case 'send': {
        if (!req.network || !isValidNetwork(req.network) || !req.to || !req.amount) {
          return { ok: false, error: 'Missing required fields: network, to, amount' }
        }
        try {
          const wdk = this.#requireWallet(wallet)
          const account = await wdk.getAccount(req.network, req.index ?? 0)
          const sendAmount = BigInt(req.amount)

          let txHash
          let from
          let fee

          if (req.token) {
            const result = await account.transfer({
              token: req.token,
              recipient: req.to,
              amount: sendAmount
            })
            txHash = result.hash
            from = await account.getAddress()
            fee = result.fee?.toString()
          } else {
            const result = await account.sendTransaction({
              to: req.to,
              value: sendAmount
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
              fee
            }
          }
        } catch (e) {
          return errorResponse(e)
        }
      }

      case 'list_wallets': {
        return { ok: true, data: { wallets: this.#getWalletStatusList() } }
      }

      case 'status': {
        return {
          ok: true,
          data: {
            unlocked: this.#wallets.size > 0,
            wallets: this.#getWalletStatusList(),
            pid: process.pid
          }
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

  /**
   * Gracefully shuts down the daemon: disposes all wallets, closes the server, removes socket/PID files, and exits.
   *
   * @returns {Promise<void>}
   */
  async shutdown () {
    for (const [, state] of this.#wallets) {
      if (state.timer) clearTimeout(state.timer)
      state.wdk.dispose()
    }
    this.#wallets.clear()

    if (this.#server) {
      this.#server.close()
      this.#server = null
    }

    // Only unlink socket on Unix; on Windows the pipe vanishes with the process
    if (process.platform !== 'win32') {
      try {
        await unlink(getDaemonSocketPath())
      } catch {
        /* */
      }
    }
    try {
      await unlink(getDaemonPidPath())
    } catch {
      /* */
    }

    process.exit(0)
  }
}

/**
 * Creates and starts the wallet daemon, registering OS signal handlers for graceful shutdown.
 *
 * @returns {Promise<void>}
 */
export async function startDaemon () {
  const daemon = new WalletDaemon()
  await daemon.start()

  const handleSignal = () => {
    daemon.shutdown().catch(() => {})
  }
  process.on('SIGTERM', handleSignal)
  process.on('SIGINT', handleSignal)
  // On Windows, SIGTERM is not supported; listen for SIGHUP as a fallback
  if (process.platform === 'win32') {
    process.on('SIGHUP', handleSignal)
  }
}
