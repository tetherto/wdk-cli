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

/** @typedef {import('./protocol.js').DaemonRequest} DaemonRequest */
/** @typedef {import('./protocol.js').DaemonResponse} DaemonResponse */
/** @typedef {import('./protocol.js').GetAddressResult} GetAddressResult */
/** @typedef {import('./protocol.js').GetBalanceResult} GetBalanceResult */
/** @typedef {import('./protocol.js').EstimateFeeResult} EstimateFeeResult */
/** @typedef {import('./protocol.js').SendResult} SendResult */
/** @typedef {import('./protocol.js').WalletStatus} WalletStatus */
/** @typedef {import('./protocol.js').ListWalletsResult} ListWalletsResult */
/** @typedef {import('./protocol.js').StatusResult} StatusResult */

import { connect } from 'node:net'
import { spawn } from 'node:child_process'
import { readFile, access, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  getDaemonSocketPath,
  getDaemonPidPath,
  DAEMON_START_RETRIES,
  DAEMON_START_RETRY_INTERVAL_MS,
  DAEMON_SPAWN_TIMEOUT_MS
} from '../config/constants.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'
/** @typedef {import('../errors/index.js').ErrorCodeType} ErrorCodeType */
import { configService } from '../services/config-service.js'
import { KeyService } from '../services/key-service.js'
import { WalletKeyring } from '../security/keyring.js'

/**
 * Resolves the absolute path to the wdk-daemon.mjs binary, relative to this file.
 *
 * @returns {string} The absolute path to wdk-daemon.mjs.
 */
function getDaemonScript () {
  return fileURLToPath(new URL('../../bin/wdk-daemon.mjs', import.meta.url))
}

/**
 * Spawns the daemon process in detached mode and waits for it to start.
 *
 * @returns {Promise<void>}
 */
function spawnDaemon () {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', getDaemonScript()],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: true, // Daemon must outlive the parent process on all platforms
        windowsHide: true // Prevents a new console window on Windows when detached
      }
    )

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    const timeout = setTimeout(() => {
      child.stderr.destroy()
      child.unref()
      resolve()
    }, DAEMON_SPAWN_TIMEOUT_MS)

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
  socketPath = getDaemonSocketPath()

  /**
   * Checks whether the daemon process is currently running.
   *
   * @returns {Promise<boolean>} True if the daemon is running.
   */
  async isRunning () {
    const isWindows = process.platform === 'win32'
    try {
      const pidPath = getDaemonPidPath()
      // On Unix, check socket file exists; on Windows, named pipes can't be checked via access()
      if (!isWindows) {
        await access(this.socketPath)
      }
      const pid = parseInt(await readFile(pidPath, 'utf8'), 10)
      try {
        process.kill(pid, 0)
        return true
      } catch (err) {
        // On Windows, process.kill(pid, 0) throws EPERM for running processes — treat as alive
        if (isWindows && err.code === 'EPERM') {
          return true
        }
        if (!isWindows) {
          try {
            await unlink(this.socketPath)
          } catch {
            /* */
          }
        }
        try {
          await unlink(pidPath)
        } catch {
          /* */
        }
        return false
      }
    } catch {
      return false
    }
  }

  /**
   * Ensures the daemon is running, spawning it if necessary.
   *
   * @returns {Promise<void>}
   */
  async ensureRunning () {
    if (await this.isRunning()) return

    await spawnDaemon()

    let retries = DAEMON_START_RETRIES
    while (retries > 0) {
      if (await this.isRunning()) {
        try {
          await this.status()
          return
        } catch {
          /* not ready yet */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, DAEMON_START_RETRY_INTERVAL_MS))
      retries--
    }
    throw new Error('Failed to start wallet daemon')
  }

  /**
   * Sends a request to the daemon over the Unix socket and returns the response.
   *
   * @param {DaemonRequest} req - The request payload.
   * @param {number} [timeoutMs] - Request timeout in milliseconds.
   * @returns {Promise<DaemonResponse>} The daemon response.
   */
  async request (req, timeoutMs = 5000) {
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

  /**
   * Throws if the daemon response indicates failure.
   *
   * @param {DaemonResponse} resp - The daemon response.
   * @param {string} fallbackMsg - Error message to use if response has no error field.
   * @returns {void}
   */
  #assertOk (resp, fallbackMsg) {
    if (resp.ok) return
    throw new WdkCliError(
      resp.error || fallbackMsg,
      /** @type {ErrorCodeType} */ (resp.code || ErrorCode.UNKNOWN_ERROR),
      resp.suggestion
    )
  }

  /**
   * Derives the wallet address for the given network and account index.
   *
   * @param {string} network - The network name.
   * @param {number} [index] - The BIP-44 account index.
   * @param {string} [wallet] - The wallet name.
   * @returns {Promise<string>} The derived address.
   */
  async getAddress (network, index = 0, wallet) {
    const resp = await this.request({ action: 'get_address', network, index, wallet }, 30000)
    this.#assertOk(resp, 'Failed to get address')
    const data = /** @type {GetAddressResult} */ (resp.data)
    return data.address
  }

  /**
   * Retrieves the balance for the given network, account index, and optional token.
   *
   * @param {string} network - The network name.
   * @param {number} [index] - The BIP-44 account index.
   * @param {string} [token] - The token contract address; omit for native balance.
   * @param {string} [wallet] - The wallet name.
   * @returns {Promise<GetBalanceResult>} The balance info.
   */
  async getBalance (network, index = 0, token, wallet) {
    const resp = await this.request({ action: 'get_balance', network, index, token, wallet }, 30000)
    this.#assertOk(resp, 'Failed to get balance')
    const data = /** @type {GetBalanceResult} */ (resp.data)
    return data
  }

  /**
   * Estimates the transaction fee for a send operation.
   *
   * @param {string} network - The network name.
   * @param {number} index - The BIP-44 account index.
   * @param {string} to - The recipient address.
   * @param {string} amount - The amount in base units as a string.
   * @param {string} [token] - The token contract address; omit for native.
   * @param {string} [wallet] - The wallet name.
   * @returns {Promise<EstimateFeeResult>} The estimated fee.
   */
  async estimateFee (network, index, to, amount, token, wallet) {
    const resp = await this.request(
      { action: 'estimate_fee', network, index, to, amount, token, wallet },
      30000
    )
    this.#assertOk(resp, 'Failed to estimate fee')
    const data = /** @type {EstimateFeeResult} */ (resp.data)
    return data
  }

  /**
   * Broadcasts a send transaction via the daemon.
   *
   * @param {string} network - The network name.
   * @param {number} index - The BIP-44 account index.
   * @param {string} to - The recipient address.
   * @param {string} amount - The amount in base units as a string.
   * @param {string} [token] - The token contract address; omit for native.
   * @param {string} [wallet] - The wallet name.
   * @returns {Promise<SendResult>} The transaction result.
   */
  async send (network, index, to, amount, token, wallet) {
    const resp = await this.request(
      { action: 'send', network, index, to, amount, token, wallet },
      60000
    )
    this.#assertOk(resp, 'Failed to send transaction')
    const data = /** @type {SendResult} */ (resp.data)
    return data
  }

  /**
   * Unlocks a wallet in the daemon session with the given passphrase and TTL.
   *
   * @param {string} name - The wallet name.
   * @param {string} passphrase - The wallet passphrase.
   * @param {number} [ttlMinutes] - Session TTL in minutes (0 = no expiry).
   * @returns {Promise<void>}
   */
  async unlockWallet (name, passphrase, ttlMinutes = 5) {
    const resp = await this.request(
      { action: 'unlock_wallet', wallet: name, passphrase, ttl: ttlMinutes },
      30000
    )
    this.#assertOk(resp, `Failed to unlock wallet '${name}'`)
  }

  /**
   * Locks a specific wallet in the daemon session.
   *
   * @param {string} name - The wallet name.
   * @returns {Promise<void>}
   */
  async lockWallet (name) {
    const resp = await this.request({ action: 'lock_wallet', wallet: name })
    this.#assertOk(resp, `Failed to lock wallet '${name}'`)
  }

  /**
   * Lists all wallets currently unlocked in the daemon session.
   *
   * @returns {Promise<WalletStatus[]>} Array of wallet status entries.
   */
  async listWallets () {
    const resp = await this.request({ action: 'list_wallets' })
    this.#assertOk(resp, 'Failed to list wallets')
    const data = /** @type {ListWalletsResult} */ (resp.data)
    return data.wallets
  }

  /**
   * Returns the current daemon status, including unlocked wallets and process PID.
   *
   * @returns {Promise<StatusResult>} The daemon status.
   */
  async status () {
    const resp = await this.request({ action: 'status' })
    this.#assertOk(resp, 'Failed to get daemon status')
    const data = /** @type {StatusResult} */ (resp.data)
    return data
  }

  /**
   * Returns whether the named wallet is currently unlocked in the daemon session.
   *
   * @param {string} wallet - The wallet name.
   * @returns {Promise<boolean>} True if the wallet is unlocked.
   */
  async isWalletUnlocked (wallet) {
    if (!(await this.isRunning())) return false
    try {
      const status = await this.status()
      return status.wallets.some((w) => w.name === wallet)
    } catch {
      return false
    }
  }

  /**
   * Asserts that a wallet is unlocked, resolving the default wallet name when none is provided.
   *
   * @param {string} [wallet] - The wallet name. Defaults to the configured default wallet.
   * @returns {Promise<string>} The resolved wallet name.
   */
  async requireUnlocked (wallet) {
    const resolved = wallet || configService.getDefaultWallet()
    if (!resolved) {
      throw new WdkCliError(
        'No default wallet configured.',
        ErrorCode.MISSING_CONFIG,
        'Set one with: wdk wallet default --name <name>'
      )
    }
    const keyService = new KeyService(new WalletKeyring())
    if (!(await keyService.hasKey(resolved))) {
      throw new WdkCliError(`Wallet '${resolved}' not found.`, ErrorCode.KEY_NOT_FOUND)
    }
    if (!(await this.isWalletUnlocked(resolved))) {
      throw new WdkCliError(
        `Wallet '${resolved}' is not unlocked.`,
        ErrorCode.WALLET_NOT_UNLOCKED,
        `Run: wdk wallet unlock --name ${resolved}`
      )
    }
    return resolved
  }

  /**
   * Sends the lock command to shut down the daemon, ignoring errors if it has already exited.
   *
   * @returns {Promise<void>}
   */
  async lock () {
    try {
      await this.request({ action: 'lock' })
    } catch {
      // Daemon may have already exited after receiving lock
    }
  }
}

export const daemonClient = new DaemonClient()
