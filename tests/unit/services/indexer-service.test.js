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

import { jest } from '@jest/globals'

import {
  getIndexerSlug,
  isIndexerSupported,
  assertIndexerAvailable,
  getTokenTransfers
} from '../../../src/services/indexer-service.js'
import { configService } from '../../../src/services/config-service.js'

describe('getIndexerSlug', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns the built-in slug from wdk.config.json', () => {
    expect(getIndexerSlug('ethereum')).toBe('ethereum')
  })

  it('returns the custom network slug from config', () => {
    const getMock = jest.spyOn(configService, 'get').mockReturnValue('dummy-slug')

    expect(getIndexerSlug('mychain')).toBe('dummy-slug')
    expect(getMock).toHaveBeenCalledWith('customNetworks.mychain.indexerSlug')
  })

  it.each(['constructor', 'toString', '__proto__'])(
    'has no slug for the inherited object property %s', (name) => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined)

      expect(getIndexerSlug(name)).toBeUndefined()
      expect(isIndexerSupported(name)).toBe(false)
    }
  )
})

describe('indexer endpoint configuration', () => {
  const ADDRESS = '0x28C6c06298d514Db089934071355E5743bf21d60'

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('refuses to call the API when the indexer provider is disabled', async () => {
    const getMock = jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'overrides' ? { providers: { 'wdk-indexer': { enabled: false } } } : undefined
    )
    const fetchMock = jest.spyOn(globalThis, 'fetch')

    await expect(getTokenTransfers('ethereum', 'usdt', ADDRESS)).rejects.toThrow(
      'No indexer is available.'
    )

    expect(getMock).toHaveBeenCalledWith('overrides')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects when no indexer is enabled', () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'overrides' ? { providers: { 'wdk-indexer': { enabled: false } } } : undefined
    )

    expect(() => assertIndexerAvailable()).toThrow(
      expect.objectContaining({
        message: 'No indexer is available.',
        code: 'MISSING_CONFIG',
        suggestion: 'Enable one with: wdk provider enable --name wdk-indexer'
      })
    )
  })

  it('refuses to guess when two indexers are enabled', () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'customProviders'
        ? { myindexer: { kind: 'indexer', config: { baseUrl: 'https://dummy-indexer.test' } } }
        : undefined
    )

    expect(() => assertIndexerAvailable()).toThrow(
      expect.objectContaining({
        message: 'Several indexers are enabled: wdk-indexer, myindexer.',
        code: 'INVALID_ARGUMENT',
        suggestion: 'Only one runs at a time. Disable the others with: wdk provider disable --name <name>'
      })
    )
  })

  it('accepts the single packaged indexer', () => {
    jest.spyOn(configService, 'get').mockReturnValue(undefined)

    expect(assertIndexerAvailable()).toBeUndefined()
  })

  it('calls the packaged base URL from the registry entry', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'providers.wdk-indexer.config'
        ? { baseUrl: 'https://wdk-api.tether.io', apiKey: 'dummy-key' }
        : undefined
    )
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      /** @type {Response} */ ({ ok: true, json: async () => ({ transfers: [] }) })
    )

    await getTokenTransfers('ethereum', 'usdt', ADDRESS)

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://wdk-api.tether.io/api/v1/ethereum/usdt/' + ADDRESS + '/token-transfers'
    )
  })

  it('reports a missing API key against the provider config key', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'providers.wdk-indexer.config' ? { baseUrl: 'https://dummy-indexer.test' } : undefined
    )

    await expect(getTokenTransfers('ethereum', 'usdt', ADDRESS)).rejects.toThrow(
      expect.objectContaining({
        message: 'Indexer is not configured: API key is required',
        code: 'MISSING_CONFIG',
        suggestion: 'Check its config, then update with: ' +
          'wdk config set --key providers.wdk-indexer.config.<setting> --value <value>'
      })
    )
  })

  it('answers a 403 with the config keys of the provider actually in use', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'customProviders'
        ? { myidx: { kind: 'indexer', config: { baseUrl: 'https://dummy-indexer.test', apiKey: 'dummy-key' } } }
        : key === 'overrides'
          ? { providers: { 'wdk-indexer': { enabled: false } } }
          : undefined
    )
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      /** @type {Response} */ ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Forbidden', message: 'Invalid API key', status: 403 })
      })
    )

    await expect(getTokenTransfers('ethereum', 'usdt', ADDRESS)).rejects.toThrow(
      expect.objectContaining({
        message: 'Indexer API error: 403 Forbidden. The configured API key was rejected.',
        code: 'NETWORK_ERROR',
        suggestion: 'Check its config, then update with: ' +
          'wdk config set --key providers.myidx.config.<setting> --value <value>'
      })
    )
  })

  it('says the key was rejected when one is configured', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'providers.wdk-indexer.config'
        ? { baseUrl: 'https://wdk-api.tether.io', apiKey: 'dummy-key' }
        : undefined
    )
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      /** @type {Response} */ ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Forbidden', message: 'Invalid API key', status: 403 })
      })
    )

    await expect(getTokenTransfers('ethereum', 'usdt', ADDRESS)).rejects.toThrow(
      expect.objectContaining({
        message: 'Indexer API error: 403 Forbidden. The configured API key was rejected.',
        code: 'NETWORK_ERROR'
      })
    )
  })

  it('passes a non-403 rejection through with its status', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'providers.wdk-indexer.config'
        ? { baseUrl: 'https://wdk-api.tether.io', apiKey: 'dummy-key' }
        : undefined
    )
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      /** @type {Response} */ ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({})
      })
    )

    await expect(getTokenTransfers('ethereum', 'usdt', ADDRESS)).rejects.toThrow(
      'Indexer API error: HTTP 503: Service Unavailable'
    )
  })

  it('passes every configured option through to the client, not just the two it reads', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'providers.wdk-indexer.config'
        ? { baseUrl: 'https://dummy-indexer.test', apiKey: 'dummy-key', timeout: 50 }
        : undefined
    )
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        )
      })
    )

    await expect(getTokenTransfers('ethereum', 'usdt', ADDRESS)).rejects.toThrow(
      'Indexer API error: Request timed out after 50ms'
    )
  })

  it('uses a configured proxy base URL instead', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key) =>
      key === 'providers.wdk-indexer.config'
        ? { baseUrl: 'https://proxy.dummy-host.test', apiKey: 'dummy-key' }
        : undefined
    )
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      /** @type {Response} */ ({ ok: true, json: async () => ({ transfers: [] }) })
    )

    await getTokenTransfers('ethereum', 'usdt', ADDRESS)

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://proxy.dummy-host.test/api/v1/ethereum/usdt/' + ADDRESS + '/token-transfers'
    )
  })
})
