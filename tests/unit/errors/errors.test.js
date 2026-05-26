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

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { WdkCliError, ErrorCode } from '../../../src/errors/index.js'

describe('WdkCliError', () => {
  it('has code and suggestion', () => {
    const err = new WdkCliError('test message', 'TEST_CODE', 'try again')
    assert.equal(err.message, 'test message')
    assert.equal(err.code, 'TEST_CODE')
    assert.equal(err.suggestion, 'try again')
    assert.ok(err instanceof Error)
  })

  it('works without suggestion', () => {
    const err = new WdkCliError('no hint', ErrorCode.KEY_NOT_FOUND)
    assert.equal(err.code, 'KEY_NOT_FOUND')
    assert.equal(err.suggestion, undefined)
  })

  it('name is WdkCliError', () => {
    const err = new WdkCliError('test', ErrorCode.UNKNOWN_ERROR)
    assert.equal(err.name, 'WdkCliError')
  })

  it('display is callable', () => {
    const err = new WdkCliError('test', ErrorCode.UNKNOWN_ERROR, 'hint')
    assert.equal(typeof err.display, 'function')
  })
})

describe('ErrorCode', () => {
  it('has all expected codes', () => {
    assert.equal(ErrorCode.KEY_NOT_FOUND, 'KEY_NOT_FOUND')
    assert.equal(ErrorCode.INVALID_SEED_PHRASE, 'INVALID_SEED_PHRASE')
    assert.equal(ErrorCode.WRONG_PASSPHRASE, 'WRONG_PASSPHRASE')
    assert.equal(ErrorCode.NETWORK_NOT_SUPPORTED, 'NETWORK_NOT_SUPPORTED')
    assert.equal(ErrorCode.INSUFFICIENT_BALANCE, 'INSUFFICIENT_BALANCE')
    assert.equal(ErrorCode.TRANSACTION_FAILED, 'TRANSACTION_FAILED')
    assert.equal(ErrorCode.NETWORK_ERROR, 'NETWORK_ERROR')
    assert.equal(ErrorCode.WALLET_LOCKED, 'WALLET_LOCKED')
    assert.equal(ErrorCode.WALLET_NOT_UNLOCKED, 'WALLET_NOT_UNLOCKED')
    assert.equal(ErrorCode.INVALID_ARGUMENT, 'INVALID_ARGUMENT')
    assert.equal(ErrorCode.INVALID_AMOUNT, 'INVALID_AMOUNT')
    assert.equal(ErrorCode.PASSPHRASE_MISMATCH, 'PASSPHRASE_MISMATCH')
    assert.equal(ErrorCode.ENVIRONMENT_MISMATCH, 'ENVIRONMENT_MISMATCH')
  })
})
