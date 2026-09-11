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

const getConfig = jest.fn()
const setConfig = jest.fn()
const deleteConfig = jest.fn()

jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: { get: getConfig, set: setConfig, delete: deleteConfig }
}))

const { getOverrides, getOverride, setOverride, clearOverride, isDisabled } =
  await import('../../../src/services/override-service.js')

beforeEach(() => {
  getConfig.mockReset()
  setConfig.mockReset()
  deleteConfig.mockReset()
  getConfig.mockReturnValue(undefined)
})

describe('getOverrides', () => {
  it('returns an empty object when unset or malformed', () => {
    expect(getOverrides()).toEqual({})
    getConfig.mockReturnValue('garbage')
    expect(getOverrides()).toEqual({})
  })

  it('returns the stored overrides', () => {
    const DUMMY_OVERRIDES = { networks: { tron: { enabled: false } } }
    getConfig.mockReturnValue(DUMMY_OVERRIDES)
    expect(getOverrides()).toEqual(DUMMY_OVERRIDES)
  })
})

describe('setOverride', () => {
  it('creates the entry and writes the whole object', () => {
    setOverride('networks', 'tron', { enabled: false })
    expect(setConfig).toHaveBeenCalledWith('overrides', {
      networks: { tron: { enabled: false } }
    })
  })

  it('merges a patch into an existing entry', () => {
    getConfig.mockReturnValue({ modules: { '@x/pkg': { version: '1.0.0' } } })
    setOverride('modules', '@x/pkg', { enabled: false })
    expect(setConfig).toHaveBeenCalledWith('overrides', {
      modules: { '@x/pkg': { version: '1.0.0', enabled: false } }
    })
  })

  it('removes fields set to undefined and prunes empty entries', () => {
    getConfig.mockReturnValue({
      networks: { tron: { enabled: false } },
      tokens: { 'ethereum/usdt': { enabled: false } }
    })
    setOverride('networks', 'tron', { enabled: undefined })
    expect(setConfig).toHaveBeenCalledWith('overrides', {
      tokens: { 'ethereum/usdt': { enabled: false } }
    })
  })

  it('deletes the config key when the last override is removed', () => {
    getConfig.mockReturnValue({ networks: { tron: { enabled: false } } })
    setOverride('networks', 'tron', { enabled: undefined })
    expect(deleteConfig).toHaveBeenCalledWith('overrides')
    expect(setConfig).not.toHaveBeenCalled()
  })
})

describe('clearOverride', () => {
  it('removes the entry entirely', () => {
    getConfig.mockReturnValue({
      modules: { '@x/pkg': { version: '1.0.0', enabled: false } },
      networks: { tron: { enabled: false } }
    })
    clearOverride('modules', '@x/pkg')
    expect(setConfig).toHaveBeenCalledWith('overrides', {
      networks: { tron: { enabled: false } }
    })
  })

  it('does nothing when no entry exists', () => {
    clearOverride('modules', '@x/pkg')
    expect(setConfig).not.toHaveBeenCalled()
    expect(deleteConfig).not.toHaveBeenCalled()
  })
})

describe('isDisabled', () => {
  it('is true only for an explicit enabled: false', () => {
    getConfig.mockReturnValue({
      networks: { tron: { enabled: false } },
      modules: { '@x/pkg': { version: '1.0.0' } }
    })
    expect(isDisabled('networks', 'tron')).toBe(true)
    expect(isDisabled('modules', '@x/pkg')).toBe(false)
    expect(isDisabled('networks', 'ethereum')).toBe(false)
    expect(getOverride('networks', 'tron')).toEqual({ enabled: false })
  })
})
