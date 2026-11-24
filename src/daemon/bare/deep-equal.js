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
 * Structural equality with the semantics of Node's `util.isDeepStrictEqual`
 * for the value shapes a config file can hold: primitives compared with
 * `Object.is`, then same prototype and, by type, Date, RegExp, typed arrays,
 * Map, Set, and own enumerable properties (arrays and plain objects).
 * Exists because `conf` imports it from `node:util` and `bare-utils` does not
 * ship it; see `./util.js`.
 *
 * @param {unknown} a - The first value.
 * @param {unknown} b - The second value.
 * @returns {boolean} True when the two values are deeply, strictly equal.
 */
export function isDeepStrictEqual (a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false

  if (a instanceof Date && b instanceof Date) return Object.is(a.getTime(), b.getTime())
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) return bytesEqual(a, b)
  if (a instanceof Map && b instanceof Map) return mapsEqual(a, b)
  if (a instanceof Set && b instanceof Set) return setsEqual(a, b)

  const objA = /** @type {Record<PropertyKey, unknown>} */ (a)
  const objB = /** @type {Record<PropertyKey, unknown>} */ (b)
  const keysA = ownEnumerableKeys(objA)
  const keysB = ownEnumerableKeys(objB)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!Object.prototype.propertyIsEnumerable.call(objB, key)) return false
    if (!isDeepStrictEqual(objA[key], objB[key])) return false
  }
  return true
}

/**
 * Compares two buffer views byte by byte.
 *
 * @param {ArrayBufferView} a - The first view.
 * @param {ArrayBufferView} b - The second view.
 * @returns {boolean} True when both views hold the same bytes.
 */
function bytesEqual (a, b) {
  if (a.byteLength !== b.byteLength) return false
  const bytesA = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  const bytesB = new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  for (let i = 0; i < bytesA.length; i++) {
    if (bytesA[i] !== bytesB[i]) return false
  }
  return true
}

/**
 * Compares two maps: same size, every key present in both, values deeply equal.
 *
 * @param {Map<unknown, unknown>} a - The first map.
 * @param {Map<unknown, unknown>} b - The second map.
 * @returns {boolean} True when the maps are deeply equal.
 */
function mapsEqual (a, b) {
  if (a.size !== b.size) return false
  for (const [key, value] of a) {
    if (!b.has(key) || !isDeepStrictEqual(value, b.get(key))) return false
  }
  return true
}

/**
 * Compares two sets: same size, and every member of one has a deeply equal
 * member in the other.
 *
 * @param {Set<unknown>} a - The first set.
 * @param {Set<unknown>} b - The second set.
 * @returns {boolean} True when the sets are deeply equal.
 */
function setsEqual (a, b) {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (b.has(value)) continue
    if (typeof value !== 'object' || value === null) return false
    let found = false
    for (const candidate of b) {
      if (isDeepStrictEqual(value, candidate)) {
        found = true
        break
      }
    }
    if (!found) return false
  }
  return true
}

/**
 * Lists an object's own enumerable string and symbol keys.
 *
 * @param {Record<PropertyKey, unknown>} obj - The object to inspect.
 * @returns {PropertyKey[]} The own enumerable keys.
 */
function ownEnumerableKeys (obj) {
  const symbols = Object.getOwnPropertySymbols(obj).filter((s) => Object.prototype.propertyIsEnumerable.call(obj, s))
  return [...Object.keys(obj), ...symbols]
}
