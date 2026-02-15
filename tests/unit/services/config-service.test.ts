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
    const value = configService.get('defaultNetwork')
    expect(value).toBeDefined()
  })

  it('sets and gets config values', () => {
    configService.set('defaultNetwork', 'polygon')
    expect(configService.get('defaultNetwork')).toBe('polygon')
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

  it('prefers env var for defaultNetwork', () => {
    process.env.WDK_DEFAULT_NETWORK = 'polygon'
    const value = configService.get('defaultNetwork')
    expect(value).toBe('polygon')
  })

  it('deletes config values', () => {
    configService.set('testKey', 'testValue')
    expect(configService.get('testKey')).toBe('testValue')
    configService.delete('testKey')
    expect(configService.get('testKey')).toBeUndefined()
  })
})
