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

export const ErrorCode = {
  KEY_NOT_FOUND: 'KEY_NOT_FOUND',
  INVALID_SEED_PHRASE: 'INVALID_SEED_PHRASE',
  WRONG_PASSPHRASE: 'WRONG_PASSPHRASE',
  MISSING_NETWORK: 'MISSING_NETWORK',
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
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
} as const

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode]

const NETWORK_ERROR_PATTERNS = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'fetch failed']

export function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return NETWORK_ERROR_PATTERNS.some((p) => msg.includes(p))
}

export class WdkCliError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCodeType,
    public readonly suggestion?: string,
  ) {
    super(message)
    this.name = 'WdkCliError'
  }

  display(): void {
    console.error(chalk.red(`Error: ${this.message}`))
    if (this.suggestion) {
      console.error(chalk.yellow(`Hint: ${this.suggestion}`))
    }
  }
}

export function handleError(error: unknown, verbose: boolean = false, json: boolean = false): never {
  if (error instanceof WdkCliError) {
    if (json) {
      console.log(JSON.stringify({ error: error.message, code: error.code, ...(error.suggestion ? { suggestion: error.suggestion } : {}) }))
    } else {
      error.display()
    }
    process.exit(1)
  }

  // Handle ethers.js and other coded errors
  if (error instanceof Error) {
    const coded = error as Error & { code?: string }
    if (coded.code) {
      const messages: Record<string, string> = {
        INSUFFICIENT_FUNDS: 'Insufficient funds for this transaction.',
        INVALID_ARGUMENT: 'Invalid argument.',
        NETWORK_ERROR: 'Cannot reach the RPC provider.',
        SERVER_ERROR: 'RPC server error.',
        TIMEOUT: 'Request timed out.',
      }
      const match = messages[coded.code]
      if (match) {
        if (json) {
          console.log(JSON.stringify({ error: match, code: coded.code }))
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
    console.log(JSON.stringify({ error: 'Unexpected error occurred.', code: ErrorCode.UNEXPECTED_ERROR }))
  } else {
    console.error(chalk.red('Unexpected error occurred.'))
  }
  process.exit(2)
}
