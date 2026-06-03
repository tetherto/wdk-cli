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
