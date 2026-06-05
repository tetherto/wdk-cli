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

import chalk from 'chalk'

/**
 * @typedef {(
 *   | 'KEY_NOT_FOUND'
 *   | 'INVALID_SEED_PHRASE'
 *   | 'WRONG_PASSPHRASE'
 *   | 'NETWORK_NOT_SUPPORTED'
 *   | 'INSUFFICIENT_BALANCE'
 *   | 'TRANSACTION_FAILED'
 *   | 'NETWORK_ERROR'
 *   | 'WALLET_NOT_UNLOCKED'
 *   | 'WALLET_EXISTS'
 *   | 'WALLET_LOCKED'
 *   | 'PASSPHRASE_MISMATCH'
 *   | 'INVALID_ARGUMENT'
 *   | 'INVALID_INDEX'
 *   | 'INVALID_CONFIG'
 *   | 'MISSING_CONFIG'
 *   | 'UNSUPPORTED_MODULE'
 *   | 'TOKEN_NOT_SUPPORTED'
 *   | 'ENVIRONMENT_MISMATCH'
 *   | 'SIGN_FAILED'
 *   | 'INVALID_AMOUNT'
 *   | 'INVALID_TOKEN'
 *   | 'PROVIDER_UNAVAILABLE'
 *   | 'QUOTE_REJECTED'
 *   | 'UNKNOWN_ERROR'
 *   | 'UNEXPECTED_ERROR'
 * )} ErrorCodeType
 */

export const ErrorCode = Object.freeze({
  KEY_NOT_FOUND: 'KEY_NOT_FOUND',
  INVALID_SEED_PHRASE: 'INVALID_SEED_PHRASE',
  WRONG_PASSPHRASE: 'WRONG_PASSPHRASE',
  NETWORK_NOT_SUPPORTED: 'NETWORK_NOT_SUPPORTED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  WALLET_NOT_UNLOCKED: 'WALLET_NOT_UNLOCKED',
  WALLET_EXISTS: 'WALLET_EXISTS',
  WALLET_LOCKED: 'WALLET_LOCKED',
  PASSPHRASE_MISMATCH: 'PASSPHRASE_MISMATCH',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  INVALID_INDEX: 'INVALID_INDEX',
  INVALID_CONFIG: 'INVALID_CONFIG',
  MISSING_CONFIG: 'MISSING_CONFIG',
  UNSUPPORTED_MODULE: 'UNSUPPORTED_MODULE',
  TOKEN_NOT_SUPPORTED: 'TOKEN_NOT_SUPPORTED',
  ENVIRONMENT_MISMATCH: 'ENVIRONMENT_MISMATCH',
  SIGN_FAILED: 'SIGN_FAILED',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_TOKEN: 'INVALID_TOKEN',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  QUOTE_REJECTED: 'QUOTE_REJECTED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR'
})

const NETWORK_ERROR_PATTERNS = [
  // Node syscall codes
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  // Ethers / RPC library codes
  'TIMEOUT',
  'NETWORK_ERROR',
  // Message fragments
  'fetch failed',
  'request timeout'
]

/**
 * Returns true when the error looks like a transient network failure.
 *
 * @param {unknown} error - The error to inspect.
 * @returns {boolean} True when the error matches a known network failure pattern.
 */
export function isNetworkError (error) {
  const msg = error instanceof Error ? error.message : String(error)
  return NETWORK_ERROR_PATTERNS.some((p) => msg.includes(p))
}

/**
 * The CLI's structured error type. Carries a stable error code and an optional user-facing hint.
 */
export class WdkCliError extends Error {
  /**
   * Creates a new WdkCliError with a stable code and optional user-facing suggestion.
   *
   * @param {string} message - The error message.
   * @param {ErrorCodeType} code - The stable error code.
   * @param {string} [suggestion] - An optional hint shown to the user.
   */
  constructor (message, code, suggestion) {
    super(message)
    this.name = 'WdkCliError'
    this.code = code
    this.suggestion = suggestion
  }

  /** Prints the error and optional hint to stderr with color. */
  display () {
    console.error(chalk.red(`Error: ${this.message}`))
    if (this.suggestion) {
      console.error(chalk.yellow(`Hint: ${this.suggestion}`))
    }
  }
}

/**
 * Top-level error handler for CLI commands. Always calls `process.exit`.
 *
 * @param {unknown} error - The thrown value to report.
 * @param {boolean} [verbose] - When true, includes the stack trace in non-JSON output.
 * @param {boolean} [json] - When true, prints a single JSON line instead of the human-readable format.
 * @returns {never}
 */
export function handleError (error, verbose = false, json = false) {
  if (error instanceof WdkCliError) {
    if (json) {
      console.log(
        JSON.stringify({
          error: error.message,
          code: error.code,
          ...(error.suggestion ? { suggestion: error.suggestion } : {})
        })
      )
    } else {
      error.display()
    }
    process.exit(1)
  }

  if (error instanceof Error) {
    const err = /** @type {Error & { code?: string }} */ (error)
    if (err.code) {
      /** @type {Record<string, string>} */
      const messages = {
        INSUFFICIENT_FUNDS: 'Insufficient funds for this transaction.',
        INVALID_ARGUMENT: 'Invalid argument.',
        NETWORK_ERROR: 'Cannot reach the RPC provider.',
        SERVER_ERROR: 'RPC server error.',
        TIMEOUT: 'Request timed out.'
      }
      const match = messages[err.code]
      if (match) {
        if (json) {
          console.log(JSON.stringify({ error: match, code: err.code }))
        } else {
          console.error(chalk.red(`Error: ${match}`))
        }
        if (verbose && !json) console.error(error.stack)
        process.exit(1)
      }
    }

    if (json) {
      console.log(JSON.stringify({ error: error.message, code: ErrorCode.UNKNOWN_ERROR }))
    } else {
      console.error(chalk.red(`Error: ${error.message}`))
    }
    if (verbose && !json) console.error(error.stack)
    process.exit(1)
  }

  if (json) {
    console.log(
      JSON.stringify({ error: 'Unexpected error occurred.', code: ErrorCode.UNEXPECTED_ERROR })
    )
  } else {
    console.error(chalk.red('Unexpected error occurred.'))
  }
  process.exit(2)
}
