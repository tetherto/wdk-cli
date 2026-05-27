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

/** @typedef {import('./types.js').RampProvider} RampProvider */

import { WdkCliError, ErrorCode } from '../../errors/index.js'
import { MoonPayRampProvider } from './moonpay.js'

/**
 * Returns the RampProvider implementation for the given ramp module.
 *
 * @param {string} module - The ramp module identifier.
 * @returns {RampProvider} The ramp provider instance.
 */
export function getRampProvider(module) {
  switch (module) {
    case 'moonpay':
      return new MoonPayRampProvider()
    default:
      throw new WdkCliError(`Unsupported ramp module '${module}'.`, ErrorCode.UNSUPPORTED_MODULE)
  }
}
