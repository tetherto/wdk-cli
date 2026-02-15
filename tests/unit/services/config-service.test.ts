import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { configService } from '../../../src/services/config-service.js'

describe('ConfigService', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('gets config values', () => {
    const value = configService.get('defaultIndex')
    expect(value).toBeDefined()
  })

  it('sets and gets config values', () => {
    configService.set('defaultIndex', 1)
    expect(configService.get('defaultIndex')).toBe(1)
    configService.set('defaultIndex', 0)
  })

  it('lists all config', () => {
    const config = configService.list()
    expect(config).toBeDefined()
    expect(typeof config).toBe('object')
  })

  it('returns provider URL from network config', () => {
    const url = configService.getProviderUrl('ethereum')
    expect(url).toContain('https://')
  })

  it('prefers env var over config for provider URL', () => {
    process.env.WDK_PROVIDER_ETHEREUM = 'https://custom-rpc.example.com'
    const url = configService.getProviderUrl('ethereum')
    expect(url).toBe('https://custom-rpc.example.com')
  })

  it('returns config path', () => {
    const path = configService.configPath
    expect(path).toBeTruthy()
    expect(typeof path).toBe('string')
  })

  it('prefers env var for indexer baseUrl', () => {
    process.env.WDK_INDEXER_BASE_URL = 'https://custom-indexer.example.com'
    const value = configService.get('indexer.baseUrl')
    expect(value).toBe('https://custom-indexer.example.com')
  })

  it('deletes config values', () => {
    configService.set('testKey', 'testValue')
    expect(configService.get('testKey')).toBe('testValue')
    configService.delete('testKey')
    expect(configService.get('testKey')).toBeUndefined()
  })
})
