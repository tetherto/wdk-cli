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

import { WdkCliError, ErrorCode } from '../errors/index.js'
import { configService } from '../services/config-service.js'

/**
 * Resolves the network from a CLI option, throwing if absent.
 *
 * @param {string | undefined} optionNetwork - The --network option value.
 * @returns {string} The resolved network name.
 */
export function resolveNetwork(optionNetwork) {
  if (optionNetwork) return optionNetwork
  throw new WdkCliError('Missing --network flag.', ErrorCode.MISSING_NETWORK, 'Run: wdk network list to see options.')
}

/**
 * Resolves the account index from a CLI option string, defaulting to the configured value.
 *
 * @param {string | undefined} optionIndex - The --index option value.
 * @returns {number} The resolved account index.
 */
export function resolveIndex(optionIndex) {
  if (!optionIndex) return configService.getDefaultIndex()
  const index = parseInt(optionIndex, 10)
  if (isNaN(index) || index < 0) {
    throw new WdkCliError('Invalid account index. Must be a non-negative integer.', ErrorCode.INVALID_INDEX)
  }
  return index
}
