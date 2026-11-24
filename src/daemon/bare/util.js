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

/**
 * `node:util` as seen by the daemon under Bare. Everything comes from
 * `bare-utils` except `isDeepStrictEqual`, which `conf` imports and
 * `bare-utils` does not provide. The import map written by `./imports.js`
 * routes `util` / `node:util` here instead of straight to `bare-utils`.
 *
 * Only ever loaded under Bare (`bare-utils` needs Bare's native bindings).
 * Delete this file, and the override in `./imports.js`, once `bare-utils`
 * exports `isDeepStrictEqual`.
 */
export * from 'bare-utils'
export { default } from 'bare-utils'
export { isDeepStrictEqual } from './deep-equal.js'
