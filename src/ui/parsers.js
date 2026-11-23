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

import { readFileSync } from 'node:fs'
import { InvalidArgumentError } from 'commander'
import { MAX_SESSION_TTL_MINUTES } from '../config/constants.js'
import { WdkCliError, ErrorCode } from '../errors/wdk-cli-error.js'

/**
 * Commander argParser for a positive integer (> 0).
 *
 * @param {string} value - The raw CLI argument.
 * @returns {number} The parsed positive integer.
 */
export function positiveInt (value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError('Must be a positive integer.')
  }
  return n
}

/**
 * Commander argParser for a non-negative integer (>= 0).
 *
 * @param {string} value - The raw CLI argument.
 * @returns {number} The parsed non-negative integer.
 */
export function nonNegativeInt (value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) {
    throw new InvalidArgumentError('Must be a non-negative integer.')
  }
  return n
}

/**
 * Commander argParser for an unlock session TTL in minutes, bounded by
 * `MAX_SESSION_TTL_MINUTES`. 0 means the session never expires.
 *
 * @param {string} value - The raw CLI argument.
 * @returns {number} The validated TTL in minutes.
 */
export function sessionTtlMinutes (value) {
  // Digits only, before any coercion: Number('') and Number(' ') are 0, which
  // is the one value that means "never expires".
  if (!/^\d+$/.test(value) || Number(value) > MAX_SESSION_TTL_MINUTES) {
    throw new InvalidArgumentError(
      `Must be a whole number of minutes from 0 to ${MAX_SESSION_TTL_MINUTES} (0 = unlimited).`
    )
  }
  return Number(value)
}

/**
 * Commander argParser for a transaction finality target.
 *
 * @param {string} value - The raw CLI argument.
 * @returns {'confirmed' | 'final'} The validated target.
 */
export function finalityTarget (value) {
  if (value !== 'confirmed' && value !== 'final') {
    throw new InvalidArgumentError("Must be 'confirmed' or 'final'.")
  }
  return value
}

/**
 * Commander argParser for a positive decimal amount (> 0). A coarse gate for
 * early, crisp rejection of `0`, negatives, and non-numbers; exact
 * token-precision validation stays in `toBaseUnits`.
 *
 * @param {string} value - The raw CLI argument.
 * @returns {string} The original value, once validated.
 */
export function decimalAmount (value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    throw new InvalidArgumentError('Must be a positive decimal amount.')
  }
  return value
}

/**
 * Auto-detects whether `value` is an inline JSON string or a path to a JSON
 * file, and parses it. The "one positional, two delivery modes" input pattern
 * used by `wdk network create` and `wdk token add`.
 *
 * Detection rule: if the value (after stripping whitespace) starts with `{`
 * or `[`, parse as inline JSON. Otherwise read the value as a file path.
 *
 * @param {string} value - Raw CLI argument; either JSON or a file path.
 * @param {string} label - Argument label for error messages (e.g. `<data>`).
 * @returns {unknown} The parsed JSON value.
 * @throws {WdkCliError} INVALID_ARGUMENT on parse or read failure.
 */
export function loadJson (value, label) {
  const trimmed = value.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(value)
    } catch (err) {
      const error = /** @type {Error} */ (err)
      throw new WdkCliError(
        `Invalid JSON in ${label}: ${error.message}`,
        ErrorCode.INVALID_ARGUMENT
      )
    }
  }
  let raw
  try {
    raw = readFileSync(value, 'utf8')
  } catch (err) {
    const error = /** @type {Error} */ (err)
    throw new WdkCliError(
      `Cannot read ${label} from '${value}': ${error.message}`,
      ErrorCode.INVALID_ARGUMENT
    )
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    const error = /** @type {Error} */ (err)
    throw new WdkCliError(
      `${label} file '${value}' is not valid JSON: ${error.message}`,
      ErrorCode.INVALID_ARGUMENT
    )
  }
}
