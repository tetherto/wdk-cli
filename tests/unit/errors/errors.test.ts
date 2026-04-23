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
import { WdkCliError, ErrorCode } from '../../../src/errors/index.js'

describe('WdkCliError', () => {
  it('has code and suggestion', () => {
    const err = new WdkCliError('test message', 'TEST_CODE', 'try again')
    expect(err.message).toBe('test message')
    expect(err.code).toBe('TEST_CODE')
    expect(err.suggestion).toBe('try again')
    expect(err).toBeInstanceOf(Error)
  })

  it('works without suggestion', () => {
    const err = new WdkCliError('no hint', ErrorCode.KEY_NOT_FOUND)
    expect(err.code).toBe('KEY_NOT_FOUND')
    expect(err.suggestion).toBeUndefined()
  })

  it('name is WdkCliError', () => {
    const err = new WdkCliError('test', ErrorCode.UNKNOWN_ERROR)
    expect(err.name).toBe('WdkCliError')
  })

  it('display is callable', () => {
    const err = new WdkCliError('test', ErrorCode.UNKNOWN_ERROR, 'hint')
    expect(typeof err.display).toBe('function')
  })
})

describe('ErrorCode', () => {
  it('has all expected codes', () => {
    expect(ErrorCode.KEY_NOT_FOUND).toBe('KEY_NOT_FOUND')
    expect(ErrorCode.INVALID_SEED_PHRASE).toBe('INVALID_SEED_PHRASE')
    expect(ErrorCode.WRONG_PASSPHRASE).toBe('WRONG_PASSPHRASE')
    expect(ErrorCode.NETWORK_NOT_SUPPORTED).toBe('NETWORK_NOT_SUPPORTED')
    expect(ErrorCode.INSUFFICIENT_BALANCE).toBe('INSUFFICIENT_BALANCE')
    expect(ErrorCode.TRANSACTION_FAILED).toBe('TRANSACTION_FAILED')
    expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR')
    expect(ErrorCode.WALLET_LOCKED).toBe('WALLET_LOCKED')
    expect(ErrorCode.WALLET_NOT_UNLOCKED).toBe('WALLET_NOT_UNLOCKED')
    expect(ErrorCode.INVALID_ARGUMENT).toBe('INVALID_ARGUMENT')
    expect(ErrorCode.INVALID_AMOUNT).toBe('INVALID_AMOUNT')
    expect(ErrorCode.PASSPHRASE_MISMATCH).toBe('PASSPHRASE_MISMATCH')
    expect(ErrorCode.ENVIRONMENT_MISMATCH).toBe('ENVIRONMENT_MISMATCH')
  })
})
