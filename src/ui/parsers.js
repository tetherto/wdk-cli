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

import { InvalidArgumentError } from 'commander'
import BigNumber from 'bignumber.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

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
 * Parses a JSON string from a CLI flag, throwing a structured `WdkCliError`
 * with a flag-specific message when the value isn't valid JSON. Used after
 * commander argument parsing — inside action handlers, not as an argParser.
 *
 * @param {string} raw - The raw value as passed by the user.
 * @param {string} flag - The flag name to reference in the error (e.g. `--data`).
 * @returns {unknown} The parsed JSON value.
 * @throws {WdkCliError} INVALID_ARGUMENT when the value isn't valid JSON.
 */
export function parseJsonArg (raw, flag) {
  try {
    return JSON.parse(raw)
  } catch {
    throw new WdkCliError(`Invalid JSON in ${flag}`, ErrorCode.INVALID_ARGUMENT)
  }
}

/**
 * Validates and shifts a human-readable decimal amount into its base-unit
 * string representation. Pure: callers provide `decimals` directly (no token
 * registry lookup — see `toBaseUnits` in `services/token-service.js` for that).
 *
 * @param {string} humanAmount - Decimal string (e.g. "1.5").
 * @param {number} decimals - Number of decimals to shift by.
 * @param {string} [label] - Used in error messages (e.g. token name or "amount").
 * @returns {string} The base-unit amount as a string (suitable for BigInt).
 * @throws {WdkCliError} INVALID_AMOUNT when the value is malformed, negative,
 *   non-finite, or has more precision than `decimals` allow.
 */
export function humanToBaseUnits (humanAmount, decimals, label = 'amount') {
  let value
  try {
    value = new BigNumber(humanAmount)
  } catch {
    throw new WdkCliError(
      `Invalid ${label} '${humanAmount}'. Must be a non-negative decimal.`,
      ErrorCode.INVALID_AMOUNT
    )
  }
  if (!value.isFinite() || value.isNaN() || value.isNegative()) {
    throw new WdkCliError(
      `Invalid ${label} '${humanAmount}'. Must be a non-negative decimal.`,
      ErrorCode.INVALID_AMOUNT
    )
  }
  const base = value.shiftedBy(decimals)
  if (!base.isInteger()) {
    throw new WdkCliError(
      `${label} '${humanAmount}' has more precision than ${decimals} decimals allow.`,
      ErrorCode.INVALID_AMOUNT
    )
  }
  return base.toFixed(0)
}
