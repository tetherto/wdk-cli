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
import { ErrorCode, WdkCliError } from './wdk-cli-error.js'

export { ErrorCode, WdkCliError, isNetworkError } from './wdk-cli-error.js'

/** @typedef {import('./wdk-cli-error.js').ErrorCodeType} ErrorCodeType */

/**
 * Prints a WdkCliError and its optional hint to stderr with color.
 *
 * @param {WdkCliError} error - The error to print.
 */
export function displayError (error) {
  console.error(chalk.red(`Error: ${error.message}`))
  if (error.suggestion) {
    console.error(chalk.yellow(`Hint: ${error.suggestion}`))
  }
}

/**
 * Top-level error handler for CLI commands. Always calls `process.exit`.
 *
 * @param {unknown} error - The thrown value to report.
 * @param {boolean} [verbose] - When true, includes the stack trace in the output
 *   (appended after the message in text mode, added as a `stack` field in JSON mode).
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
          ...(error.suggestion ? { suggestion: error.suggestion } : {}),
          ...(verbose && error.stack ? { stack: error.stack } : {})
        })
      )
    } else {
      displayError(error)
      if (verbose && error.stack) console.error(error.stack)
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
          console.log(JSON.stringify({
            error: match,
            code: err.code,
            ...(verbose && error.stack ? { stack: error.stack } : {})
          }))
        } else {
          console.error(chalk.red(`Error: ${match}`))
          if (verbose && error.stack) console.error(error.stack)
        }
        process.exit(1)
      }
    }

    if (json) {
      console.log(JSON.stringify({
        error: error.message,
        code: ErrorCode.UNKNOWN_ERROR,
        ...(verbose && error.stack ? { stack: error.stack } : {})
      }))
    } else {
      console.error(chalk.red(`Error: ${error.message}`))
      if (verbose && error.stack) console.error(error.stack)
    }
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
