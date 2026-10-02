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

import { isDeepStrictEqual } from '../../../../src/daemon/bare/deep-equal.js'

describe('isDeepStrictEqual', () => {
  describe('primitives', () => {
    it('treats identical primitives as equal', () => {
      expect(isDeepStrictEqual(1, 1)).toBe(true)
      expect(isDeepStrictEqual('a', 'a')).toBe(true)
      expect(isDeepStrictEqual(null, null)).toBe(true)
      expect(isDeepStrictEqual(undefined, undefined)).toBe(true)
    })

    it('does not coerce types', () => {
      expect(isDeepStrictEqual(1, '1')).toBe(false)
      expect(isDeepStrictEqual(0, false)).toBe(false)
      expect(isDeepStrictEqual(null, undefined)).toBe(false)
    })

    it('follows Object.is for NaN and signed zero', () => {
      expect(isDeepStrictEqual(NaN, NaN)).toBe(true)
      expect(isDeepStrictEqual(0, -0)).toBe(false)
    })
  })

  describe('objects and arrays', () => {
    it('compares nested config-shaped values structurally', () => {
      const a = { networks: { ethereum: { rpc: 'https://a', chainId: 1 } }, tokens: ['USDT', 'XAUT'] }
      const b = { networks: { ethereum: { rpc: 'https://a', chainId: 1 } }, tokens: ['USDT', 'XAUT'] }
      expect(isDeepStrictEqual(a, b)).toBe(true)
    })

    it('detects a changed leaf', () => {
      expect(isDeepStrictEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false)
    })

    it('detects a missing or extra key', () => {
      expect(isDeepStrictEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
      expect(isDeepStrictEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false)
    })

    it('ignores key order', () => {
      expect(isDeepStrictEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    })

    it('distinguishes arrays from objects with the same indices', () => {
      expect(isDeepStrictEqual([1, 2], { 0: 1, 1: 2 })).toBe(false)
    })

    it('compares array length and order', () => {
      expect(isDeepStrictEqual([1, 2, 3], [1, 2, 3])).toBe(true)
      expect(isDeepStrictEqual([1, 2, 3], [1, 3, 2])).toBe(false)
      expect(isDeepStrictEqual([1, 2], [1, 2, 3])).toBe(false)
    })

    it('distinguishes prototypes', () => {
      expect(isDeepStrictEqual(Object.create(null), {})).toBe(false)
    })
  })

  describe('built-in types', () => {
    it('compares dates by time', () => {
      expect(isDeepStrictEqual(new Date(1000), new Date(1000))).toBe(true)
      expect(isDeepStrictEqual(new Date(1000), new Date(2000))).toBe(false)
    })

    it('compares regexps by source and flags', () => {
      expect(isDeepStrictEqual(/a/gi, /a/gi)).toBe(true)
      expect(isDeepStrictEqual(/a/g, /a/i)).toBe(false)
    })

    it('compares typed arrays by content', () => {
      expect(isDeepStrictEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
      expect(isDeepStrictEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false)
      expect(isDeepStrictEqual(new Uint8Array([1, 2]), new Uint16Array([1, 2]))).toBe(false)
    })

    it('compares maps by entries', () => {
      expect(isDeepStrictEqual(new Map([['k', { v: 1 }]]), new Map([['k', { v: 1 }]]))).toBe(true)
      expect(isDeepStrictEqual(new Map([['k', 1]]), new Map([['k', 2]]))).toBe(false)
      expect(isDeepStrictEqual(new Map([['k', 1]]), new Map())).toBe(false)
    })

    it('compares sets by members, deeply for objects', () => {
      expect(isDeepStrictEqual(new Set([1, 'a']), new Set(['a', 1]))).toBe(true)
      expect(isDeepStrictEqual(new Set([{ a: 1 }]), new Set([{ a: 1 }]))).toBe(true)
      expect(isDeepStrictEqual(new Set([{ a: 1 }]), new Set([{ a: 2 }]))).toBe(false)
      expect(isDeepStrictEqual(new Set([1]), new Set([1, 2]))).toBe(false)
    })
  })
})
