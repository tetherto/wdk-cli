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

import { mnemonicToSeedSync } from 'bip39'
import { deriveKey, decryptWithKey } from '@tetherto/wdk-utils'
import {
  SESSION_TTL_MINUTES,
  MAX_SESSION_TTL_MINUTES,
  validateWalletName
} from '../../config/constants.js'
import { configService } from '../../services/config-service.js'
import { WdkService } from '../../services/wdk-service.js'
import { isValidNetwork, getNetworkConfig } from '../../config/networks.js'
import { getTokenByAddress } from '../../services/token-service.js'
import { getMethod, convertMethodArgs, bigintReplacer } from '../../services/methods.js'
import { quoteBest, executeBest } from '../../services/swap-orchestrator.js'
import { WdkCliError, ErrorCode } from '../../errors/wdk-cli-error.js'
import { formatAmount } from '../../ui/formatters.js'

/** @typedef {import('../protocol.js').DaemonRequest} DaemonRequest */
/** @typedef {import('../protocol.js').DaemonResponse} DaemonResponse */
/** @typedef {import('../protocol.js').WalletStatus} WalletStatus */
/** @typedef {import('@tetherto/wdk').WdkAccount} WalletAccount */
/** @typedef {import('../../services/protocol-adapter.js').SwapRequest} SwapRequest */
/** @typedef {import('../../services/swap-orchestrator.js').RouteRequestContext} RouteRequestContext */
/** @typedef {import('./interfaces.js').WalletStore} WalletStore */
/** @typedef {import('./interfaces.js').DaemonCoreOptions} DaemonCoreOptions */

/**
 * @typedef {Object} QuoteInputs
 * @property {WalletAccount} account - The source-network account that pays.
 * @property {string} from - The paying account's address, reported back to the caller.
 * @property {SwapRequest} request - The normalized request with BigInt amounts and a resolved recipient.
 * @property {RouteRequestContext} context - Display context for the no-route message.
 */

/**
 * @typedef {Object} WalletState
 * @property {WdkService} wdk - The WDK service instance for this wallet.
 * @property {ReturnType<typeof setTimeout> | null} timer - The auto-lock timer handle.
 * @property {number} ttlMs - The session TTL in milliseconds (0 = no expiry).
 * @property {number} expiresAt - The Unix timestamp (ms) when the session expires (0 = no expiry).
 */

/** Max length of a summarized third-party error message before truncation. */
const MAX_ERROR_LEN = 200

/**
 * Reports whether a requested session TTL is one the daemon will honour: whole
 * minutes, from 0 (no expiry) to `MAX_SESSION_TTL_MINUTES`.
 *
 * @param {unknown} ttl - The TTL the caller asked for, in minutes.
 * @returns {boolean} True when the TTL is in range.
 */
function isValidTtl (ttl) {
  return typeof ttl === 'number' &&
    Number.isInteger(ttl) &&
    ttl >= 0 &&
    ttl <= MAX_SESSION_TTL_MINUTES
}

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
  const err = /** @type {Error & { code?: unknown, suggestion?: unknown, shortMessage?: unknown }} */ (e)

  // Pass our own WdkCliError messages through verbatim (concise, sometimes
  // intentionally multi-line). Summarize only third-party errors — ethers packs
  // the whole failing tx into `message`, so prefer `shortMessage` and cap it.
  let error
  if (e instanceof WdkCliError) {
    error = err.message
  } else {
    const raw = typeof err.shortMessage === 'string' ? err.shortMessage : err.message
    error = raw.length > MAX_ERROR_LEN ? raw.slice(0, MAX_ERROR_LEN) + '…' : raw
  }

  const suggestion = typeof err.suggestion === 'string'
    ? err.suggestion
    : err.code === 'INSUFFICIENT_FUNDS'
      ? 'Quoting a swap/bridge estimates the on-chain tx, so the account must hold the input token plus native gas (or use a gasless 4337/7702 account).'
      : undefined

  return {
    ok: false,
    error,
    ...(typeof err.code === 'string' ? { code: err.code } : {}),
    ...(suggestion ? { suggestion } : {})
  }
}

/**
 * The wallet daemon's logic, independent of how requests arrive: holds the
 * unlocked wallets and their sessions, and answers daemon requests. A host
 * (the desktop socket server, a mobile worklet) feeds it requests and owns
 * the process.
 */
export class WalletDaemonCore {
  /** @type {Map<string, WalletState>} */
  #wallets = new Map()
  /** @type {WalletStore} */
  #walletStore
  /** @type {number} */
  #pid
  /** @type {() => void} */
  #requestShutdown

  /**
   * Creates the daemon core with no wallet unlocked.
   *
   * @param {DaemonCoreOptions} options - What the host provides.
   */
  constructor ({ walletStore, pid, requestShutdown }) {
    this.#walletStore = walletStore
    this.#pid = pid
    this.#requestShutdown = requestShutdown
  }

  /**
   * Decrypts and loads a wallet into the in-memory session map, or extends the
   * session when that wallet is already unlocked. The passphrase is verified
   * either way. Everything after the seed file is read runs synchronously, so
   * two concurrent unlocks of one wallet cannot both create a session.
   *
   * @param {string} name - The wallet name.
   * @param {string} passphrase - The wallet passphrase.
   * @param {number} ttlMinutes - The session TTL in minutes (0 = no expiry).
   * @returns {Promise<void>}
   * @throws {WdkCliError} WRONG_PASSPHRASE when the passphrase does not decrypt the seed.
   * @throws {WdkCliError} INVALID_ARGUMENT when the wallet name is not a valid one.
   * @throws {Error} When the wallet's seed file cannot be read or parsed.
   */
  async #unlockWallet (name, passphrase, ttlMinutes) {
    const data = await this.#walletStore.readSeedFile(validateWalletName(name))
    const payload = JSON.parse(data)
    const salt = Buffer.from(payload.salt, 'hex')
    const key = deriveKey(passphrase, salt, payload)
    try {
      let seedPhrase
      try {
        seedPhrase = decryptWithKey(payload, key)
      } catch {
        throw new WdkCliError('Incorrect passphrase.', ErrorCode.WRONG_PASSPHRASE)
      }

      if (this.#wallets.has(name)) {
        this.#resetTimer(name, ttlMinutes)
        return
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

    if (this.#wallets.size === 0) {
      this.#requestShutdown()
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
   * Dispatches a daemon request to the appropriate handler and returns the response.
   * Never rejects: every failure becomes a response with `ok: false`.
   *
   * @param {DaemonRequest} req - The request object.
   * @returns {Promise<DaemonResponse>} The response to send back to the client.
   */
  async handleRequest (req) {
    const wallet = req.wallet || configService.getDefaultWallet()

    switch (req.action) {
      case 'unlock_wallet': {
        if (!wallet) {
          return { ok: false, error: 'Missing wallet name' }
        }
        if (req.passphrase == null) {
          return { ok: false, error: 'Missing passphrase' }
        }
        if (req.ttl != null && !isValidTtl(req.ttl)) {
          return {
            ok: false,
            error: `Invalid ttl: ${req.ttl}. Give whole minutes from 0 to ${MAX_SESSION_TTL_MINUTES} (0 = unlimited).`
          }
        }
        try {
          const ttl = req.ttl ?? SESSION_TTL_MINUTES
          await this.#unlockWallet(wallet, req.passphrase, ttl)
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

      case 'call_method': {
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        if (!req.method) {
          return { ok: false, error: 'Missing required field: method' }
        }
        try {
          const wdk = this.#requireWallet(wallet)
          // Re-validate against the daemon's own catalog copy: only declared
          // methods are invocable, regardless of what the client sent.
          const method = getMethod(req.network, req.method)
          const values = convertMethodArgs(method, req.args || {})
          const account = await wdk.getAccount(req.network, req.index ?? 0)
          const result = await account[req.method](...values)
          const safe = result === undefined
            ? null
            : JSON.parse(JSON.stringify({ v: result }, bigintReplacer)).v
          return { ok: true, data: { result: safe, address: await account.getAddress() } }
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
          const address = await account.getAddress()

          if (req.token) {
            const balance = await account.getTokenBalance(req.token)
            const tokenInfo = getTokenByAddress(req.network, req.token)
            return {
              ok: true,
              data: {
                balance: balance.toString(),
                symbol: tokenInfo?.symbol || 'tokens',
                decimals: tokenInfo?.decimals || 0,
                address
              }
            }
          }

          const balance = await account.getBalance()
          return {
            ok: true,
            data: {
              balance: balance.toString(),
              symbol: networkConfig.nativeSymbol,
              decimals: networkConfig.decimals,
              address
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

          return { ok: true, data: { fee: fee.toString(), feeFormatted, from: await account.getAddress() } }
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

          const result = req.token
            ? await account.transfer({ token: req.token, recipient: req.to, amount: sendAmount })
            : await account.sendTransaction({ to: req.to, value: sendAmount })

          return {
            ok: true,
            data: {
              txHash: result.hash,
              network: req.network,
              from: await account.getAddress(),
              to: req.to,
              amount: req.amount,
              fee: result.fee?.toString()
            }
          }
        } catch (e) {
          return errorResponse(e)
        }
      }

      case 'sign_message': {
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        if (!req.message) {
          return { ok: false, error: 'Missing required field: message' }
        }
        try {
          const wdk = this.#requireWallet(wallet)
          const account = await wdk.getAccount(req.network, req.index ?? 0)
          const signature = await account.sign(req.message)
          const address = await account.getAddress()
          return { ok: true, data: { address, signature } }
        } catch (e) {
          return errorResponse(e)
        }
      }

      case 'verify_message': {
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        if (!req.message || !req.signature) {
          return { ok: false, error: 'Missing required fields: message, signature' }
        }
        try {
          const wdk = this.#requireWallet(wallet)
          const account = await wdk.getAccount(req.network, req.index ?? 0)
          const valid = await account.verify(req.message, req.signature)
          return { ok: true, data: { valid, address: await account.getAddress() } }
        } catch (e) {
          return errorResponse(e)
        }
      }

      case 'get_transaction': {
        if (!req.network || !isValidNetwork(req.network)) {
          return { ok: false, error: `Invalid network: ${req.network}` }
        }
        if (!req.hash) {
          return { ok: false, error: 'Missing required field: hash' }
        }
        try {
          const wdk = this.#requireWallet(wallet)
          const account = await wdk.getAccount(req.network, req.index ?? 0)
          const receipt = req.finality
            ? await account.waitForTransaction(req.hash, {
              target: req.finality,
              ...(req.timeout ? { timeout: req.timeout } : {})
            })
            : await account.getTransaction(req.hash)
          const safe = JSON.parse(JSON.stringify({ v: receipt }, bigintReplacer)).v
          return { ok: true, data: { transaction: safe } }
        } catch (e) {
          return errorResponse(e)
        }
      }
      case 'quote_swap':
        return this.#handleQuote(req, 'swap', wallet)

      case 'quote_bridge':
        return this.#handleQuote(req, 'bridge', wallet)

      case 'execute_swap':
        return this.#handleExecute(req, 'swap', wallet)

      case 'execute_bridge':
        return this.#handleExecute(req, 'bridge', wallet)

      case 'list_wallets': {
        return { ok: true, data: { wallets: this.#getWalletStatusList() } }
      }

      case 'status': {
        return {
          ok: true,
          data: {
            unlocked: this.#wallets.size > 0,
            wallets: this.#getWalletStatusList(),
            pid: this.#pid
          }
        }
      }

      case 'lock': {
        setTimeout(() => this.#requestShutdown(), 100)
        return { ok: true, data: { message: 'All wallets locked' } }
      }

      default:
        return { ok: false, error: `Unknown action: ${req.action}` }
    }
  }

  /**
   * Handles a best-route quote request (swap or bridge). Resolves the account
   * for the source network, converts the string amounts back to BigInt, quotes
   * every capable protocol concurrently, and returns the winning quote with
   * BigInt fields serialized as strings.
   *
   * @param {DaemonRequest} req - The parsed request object.
   * @param {'swap' | 'bridge'} requestKind - Which kind of quote to run.
   * @param {string} wallet - The resolved wallet name.
   * @returns {Promise<DaemonResponse>} The response with the best quote.
   */
  async #handleQuote (req, requestKind, wallet) {
    if (!req.network || !isValidNetwork(req.network)) {
      return { ok: false, error: `Invalid network: ${req.network}` }
    }
    if (!req.request) {
      return { ok: false, error: 'Missing required field: request' }
    }
    try {
      const { account, from, request, context } = await this.#resolveQuoteInputs(req, wallet)
      const { quote: best, failures } = await quoteBest({
        account,
        requestKind,
        network: req.network,
        request,
        context,
        protocol: req.protocol
      })

      return {
        ok: true,
        data: {
          protocol: best.protocol,
          from,
          inputAmount: best.inputAmount !== undefined ? best.inputAmount.toString() : undefined,
          outputAmount: best.outputAmount.toString(),
          fees: JSON.parse(JSON.stringify({ v: best.fees }, bigintReplacer)).v,
          skipped: failures
        }
      }
    } catch (e) {
      return errorResponse(e)
    }
  }

  /**
   * Handles a best-route execution request (swap or bridge): quotes every
   * capable protocol to pick the winner, executes only the winner as a single
   * transaction, and returns its result plus the protocols that were skipped.
   *
   * @param {DaemonRequest} req - The parsed request object.
   * @param {'swap' | 'bridge'} requestKind - Which kind of transaction to run.
   * @param {string} wallet - The resolved wallet name.
   * @returns {Promise<DaemonResponse>} The response with the execution result.
   */
  async #handleExecute (req, requestKind, wallet) {
    if (!req.network || !isValidNetwork(req.network)) {
      return { ok: false, error: `Invalid network: ${req.network}` }
    }
    if (!req.request) {
      return { ok: false, error: 'Missing required field: request' }
    }
    try {
      const { account, from, request, context } = await this.#resolveQuoteInputs(req, wallet)
      const { protocol, result, failures } = await executeBest({
        account,
        requestKind,
        network: req.network,
        request,
        context,
        protocol: req.protocol
      })

      return {
        ok: true,
        data: {
          protocol,
          from,
          result: JSON.parse(JSON.stringify({ v: result }, bigintReplacer)).v,
          skipped: failures
        }
      }
    } catch (e) {
      return errorResponse(e)
    }
  }

  /**
   * Builds the account, normalized request, and display context shared by the
   * quote and execute handlers. Converts the string amounts back to BigInt and
   * defaults the recipient to the wallet's own address on the destination
   * network — the same seed owns an address on every chain, so a cross-VM
   * route receives a correctly-formatted recipient (bridge requires one;
   * swap's `to` is optional).
   *
   * @param {DaemonRequest} req - The parsed request object (with `req.request` set).
   * @param {string} wallet - The resolved wallet name.
   * @returns {Promise<QuoteInputs>} The inputs shared by the quote and execute handlers.
   */
  async #resolveQuoteInputs (req, wallet) {
    const wdk = this.#requireWallet(wallet)
    const account = await wdk.getAccount(req.network, req.index ?? 0)

    const from = await account.getAddress()

    const r = /** @type {import('../protocol.js').QuoteRequest} */ (req.request)
    const destAccount = r.toNetwork && r.toNetwork !== req.network
      ? await wdk.getAccount(r.toNetwork, req.index ?? 0)
      : account
    const recipient = r.recipient || (destAccount === account ? from : await destAccount.getAddress())
    const request = /** @type {SwapRequest} */ ({
      fromToken: r.fromToken,
      toToken: r.toToken,
      toChain: r.toChain,
      amountIn: r.amountIn !== undefined ? BigInt(r.amountIn) : undefined,
      amountOut: r.amountOut !== undefined ? BigInt(r.amountOut) : undefined,
      recipient
    })
    const context = { fromToken: r.fromSymbol, toToken: r.toSymbol, toNetwork: r.toNetwork }
    return { account, from, request, context }
  }

  /**
   * Locks every wallet: clears its timer and disposes its keys.
   *
   * @returns {void}
   */
  dispose () {
    for (const [, state] of this.#wallets) {
      if (state.timer) clearTimeout(state.timer)
      state.wdk.dispose()
    }
    this.#wallets.clear()
  }
}
