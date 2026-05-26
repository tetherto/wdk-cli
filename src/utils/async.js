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
 * Races a promise against a timeout, rejecting with a descriptive error if the timeout fires first.
 *
 * @template T
 * @param {Promise<T>} promise - The promise to race.
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} label - Label used in the timeout error message.
 * @returns {Promise<T>} Resolves with the promise value or rejects on timeout.
 */
export function withTimeout(promise, ms, label) {
  let timer
  return Promise.race([
    promise.then((v) => { clearTimeout(timer); return v }),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s. The RPC provider may be slow or unreachable.`)),
        ms
      )
    })
  ])
}
