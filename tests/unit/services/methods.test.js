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

import {
  convertMethodArgs,
  parseMethodArgs,
  paramToFlag,
  describeParams,
  splitParamUsage,
  bigintReplacer
} from '../../../src/services/methods.js'

const METHOD = {
  kind: 'write',
  params: { txid: 'string', amount: 'bigint', maxFee: 'bigint?', fast: 'boolean?' }
}

const OBJECT_METHOD = {
  kind: 'write',
  style: 'object',
  params: { token: 'string', spender: 'string', amount: 'bigint' }
}

const LIST_METHOD = {
  kind: 'read',
  params: { tokenAddresses: 'string[]' }
}

const NESTED_METHOD = {
  kind: 'write',
  params: {
    invoices: [{ id: 'string', amount: 'bigint', memo: 'string?' }],
    fast: 'boolean?'
  }
}

describe('convertMethodArgs', () => {
  it('converts declared types and returns values in schema order', () => {
    const values = convertMethodArgs(METHOD, {
      txid: 'abc123',
      amount: '5000',
      maxFee: '100',
      fast: 'true'
    })

    expect(values).toEqual(['abc123', 5000n, 100n, true])
  })

  it('omits trailing optional parameters that were not provided', () => {
    const values = convertMethodArgs(METHOD, { txid: 'abc123', amount: '5000' })

    expect(values).toEqual(['abc123', 5000n])
  })

  it('rejects a missing required parameter', () => {
    expect(() => convertMethodArgs(METHOD, { txid: 'abc123' })).toThrow(
      'Missing required parameter --amount.'
    )
  })

  it('rejects an unknown parameter', () => {
    expect(() => convertMethodArgs(METHOD, { txid: 'a', amount: '1', nope: 'x' })).toThrow(
      'Unknown parameter --nope.'
    )
  })

  it('rejects a non-integer bigint value', () => {
    expect(() => convertMethodArgs(METHOD, { txid: 'a', amount: '1.5' })).toThrow(
      'Invalid --amount: expected an integer in base units (e.g. sats).'
    )
  })

  it('builds a single options object for object-style methods', () => {
    const values = convertMethodArgs(OBJECT_METHOD, {
      token: 'dummy-token',
      spender: 'dummy-spender',
      amount: '1000000'
    })

    expect(values).toEqual([{ token: 'dummy-token', spender: 'dummy-spender', amount: 1000000n }])
  })

  it('rejects a missing required parameter for object-style methods', () => {
    expect(() => convertMethodArgs(OBJECT_METHOD, { token: 'dummy-token' })).toThrow(
      'Missing required parameter --spender.'
    )
  })

  it('converts a comma-separated string[] parameter', () => {
    const values = convertMethodArgs(LIST_METHOD, { tokenAddresses: '0xa, 0xb,0xc' })

    expect(values).toEqual([['0xa', '0xb', '0xc']])
  })

  it('rejects an empty string[] value', () => {
    expect(() => convertMethodArgs(LIST_METHOD, { tokenAddresses: ' , ' })).toThrow(
      'Invalid --token-addresses: expected a comma-separated list.'
    )
  })

  it('converts a comma-separated bigint[] parameter', () => {
    const method = { kind: 'read', params: { amounts: 'bigint[]' } }

    const values = convertMethodArgs(method, { amounts: '5000, 7000' })

    expect(values).toEqual([[5000n, 7000n]])
  })

  it('marshals an array of objects from a JSON string, converting nested bigints', () => {
    const values = convertMethodArgs(NESTED_METHOD, {
      invoices: '[{"id":"a","amount":"5000"},{"id":"b","amount":"7000","memo":"hi"}]'
    })

    expect(values).toEqual([
      [
        { id: 'a', amount: 5000n },
        { id: 'b', amount: 7000n, memo: 'hi' }
      ]
    ])
  })

  it('accepts native JSON numbers and booleans inside structured values', () => {
    const method = { kind: 'write', params: { options: { amountSats: 'number', urgent: 'boolean?' } } }

    const values = convertMethodArgs(method, { options: '{"amountSats":1500,"urgent":true}' })

    expect(values).toEqual([{ amountSats: 1500, urgent: true }])
  })

  it('rejects a malformed JSON value for a structured parameter', () => {
    expect(() => convertMethodArgs(NESTED_METHOD, { invoices: 'not-json' })).toThrow(
      'Invalid --invoices: expected JSON.'
    )
  })

  it('rejects an unknown field inside a structured value', () => {
    expect(() => convertMethodArgs(NESTED_METHOD, { invoices: '[{"id":"a","amount":"5000","nope":1}]' })).toThrow(
      "Unknown field 'nope' in --invoices."
    )
  })

  it('rejects a missing required field inside a structured value', () => {
    expect(() => convertMethodArgs(NESTED_METHOD, { invoices: '[{"id":"a"}]' })).toThrow(
      "Missing required field 'amount' in --invoices."
    )
  })

  it('rejects a bigint given as a JSON number inside a structured value', () => {
    expect(() => convertMethodArgs(NESTED_METHOD, { invoices: '[{"id":"a","amount":5000}]' })).toThrow(
      'Invalid --invoices: expected bigint.'
    )
  })
})

describe('parseMethodArgs', () => {
  it('maps value-taking flags to their values and kebab flags to camelCase params', () => {
    const args = parseMethodArgs(['--txid', 'abc123', '--max-fee', '100'])

    expect(args).toEqual({ txid: 'abc123', maxFee: '100' })
  })

  it('requires an explicit value for a boolean flag', () => {
    const args = parseMethodArgs(['--fast', 'false'])

    expect(args).toEqual({ fast: 'false' })
  })

  it('throws when an optional boolean flag (boolean?) is missing its value', () => {
    expect(() => parseMethodArgs(['--txid', 'abc123', '--fast'])).toThrow(
      'Missing value for --fast.'
    )
  })

  it('throws when a required boolean flag (boolean) is missing its value', () => {
    expect(() => parseMethodArgs(['--enabled'])).toThrow('Missing value for --enabled.')
  })

  it('throws when a flag is missing its value before another flag', () => {
    expect(() => parseMethodArgs(['--txid', '--amount', '1000'])).toThrow(
      'Missing value for --txid.'
    )
  })

  it('throws when a flag is missing its value at the end', () => {
    expect(() => parseMethodArgs(['--amount', '1000', '--txid'])).toThrow(
      'Missing value for --txid.'
    )
  })

  it('throws when a token is not a flag', () => {
    expect(() => parseMethodArgs(['abc123'])).toThrow("Unexpected argument 'abc123'.")
  })

  it('returns no args for empty tokens', () => {
    expect(parseMethodArgs([])).toEqual({})
  })
})

describe('paramToFlag', () => {
  it('converts camelCase parameter names to kebab-case flags', () => {
    expect(paramToFlag('maxFee')).toBe('max-fee')
    expect(paramToFlag('txid')).toBe('txid')
  })
})

describe('describeParams', () => {
  it('renders required and optional parameters', () => {
    expect(describeParams(METHOD)).toBe(
      'Params: --txid <string> --amount <bigint> [--max-fee <bigint>] [--fast <boolean>]'
    )
  })

  it('describes a method without parameters', () => {
    expect(describeParams({ kind: 'read', params: {} })).toBe('None')
  })

  it('renders structured parameters as json', () => {
    expect(describeParams(NESTED_METHOD)).toBe('Params: --invoices <json> [--fast <boolean>]')
  })
})

describe('splitParamUsage', () => {
  it('buckets required and optional parameters into separate flag usages', () => {
    expect(splitParamUsage(METHOD)).toEqual({
      required: ['--txid <string>', '--amount <bigint>'],
      optional: ['--max-fee <bigint>', '--fast <boolean>']
    })
  })

  it('returns empty groups for a method without parameters', () => {
    expect(splitParamUsage({ kind: 'read', params: {} })).toEqual({ required: [], optional: [] })
  })

  it('treats structured parameters as required json', () => {
    expect(splitParamUsage(NESTED_METHOD)).toEqual({
      required: ['--invoices <json>'],
      optional: ['--fast <boolean>']
    })
  })
})

describe('bigintReplacer', () => {
  it('serializes BigInt values as strings', () => {
    expect(JSON.stringify({ balance: 1234n }, bigintReplacer)).toBe('{"balance":"1234"}')
  })
})
