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

import { describe, it, expect } from 'vitest'
import {
  WdkCliError,
  KeyNotFoundError,
  InvalidSeedPhraseError,
  WrongPasswordError,
  NetworkNotSupportedError,
  InsufficientBalanceError,
  TransactionFailedError,
  NetworkError,
} from '../../../src/errors/index.js'

describe('error classes', () => {
  it('WdkCliError has code and suggestion', () => {
    const err = new WdkCliError('test message', 'TEST_CODE', 'try again')
    expect(err.message).toBe('test message')
    expect(err.code).toBe('TEST_CODE')
    expect(err.suggestion).toBe('try again')
    expect(err).toBeInstanceOf(Error)
  })

  it('KeyNotFoundError', () => {
    const err = new KeyNotFoundError()
    expect(err.code).toBe('KEY_NOT_FOUND')
    expect(err.suggestion).toContain('wdk wallet create')
  })

  it('InvalidSeedPhraseError', () => {
    const err = new InvalidSeedPhraseError()
    expect(err.code).toBe('INVALID_SEED_PHRASE')
  })

  it('WrongPasswordError', () => {
    const err = new WrongPasswordError()
    expect(err.code).toBe('WRONG_PASSWORD')
  })

  it('NetworkNotSupportedError includes network name', () => {
    const err = new NetworkNotSupportedError('solana')
    expect(err.message).toContain('solana')
    expect(err.code).toBe('NETWORK_NOT_SUPPORTED')
  })

  it('InsufficientBalanceError shows amounts', () => {
    const err = new InsufficientBalanceError('100', '200', 'ETH')
    expect(err.message).toContain('100')
    expect(err.message).toContain('200')
    expect(err.message).toContain('ETH')
  })

  it('TransactionFailedError includes reason', () => {
    const err = new TransactionFailedError('gas too low', '0xabc')
    expect(err.message).toContain('gas too low')
    expect(err.message).toContain('0xabc')
  })

  it('NetworkError includes provider URL', () => {
    const err = new NetworkError('https://eth.drpc.org')
    expect(err.message).toContain('eth.drpc.org')
    expect(err.suggestion).toContain('RPC URL')
  })
})
