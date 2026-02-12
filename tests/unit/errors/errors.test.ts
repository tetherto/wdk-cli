import { describe, it, expect } from 'vitest'
import {
  WdkCliError,
  KeyNotFoundError,
  InvalidSeedPhraseError,
  WrongPasswordError,
  ChainNotSupportedError,
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
    expect(err.suggestion).toContain('wdk key generate')
  })

  it('InvalidSeedPhraseError', () => {
    const err = new InvalidSeedPhraseError()
    expect(err.code).toBe('INVALID_SEED_PHRASE')
  })

  it('WrongPasswordError', () => {
    const err = new WrongPasswordError()
    expect(err.code).toBe('WRONG_PASSWORD')
  })

  it('ChainNotSupportedError includes chain name', () => {
    const err = new ChainNotSupportedError('solana')
    expect(err.message).toContain('solana')
    expect(err.code).toBe('CHAIN_NOT_SUPPORTED')
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
