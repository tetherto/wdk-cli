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

import BigNumber from 'bignumber.js'
import { WdkCliError, ErrorCode } from '../errors/wdk-cli-error.js'

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
