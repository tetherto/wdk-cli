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
import { createRequire } from 'node:module'

const getConfig = jest.fn()
const setConfig = jest.fn()
const deleteConfig = jest.fn()

jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: { get: getConfig, set: setConfig, delete: deleteConfig }
}))

const {
  getInstalledVersion,
  getAllModules,
  getModuleStatuses,
  resolveAddTarget,
  resolveRemoveTarget,
  saveCustomModule,
  removeCustomModule,
  setModuleEnabled
} = await import('../../../src/services/module-service.js')

const require = createRequire(import.meta.url)
const catalog = require('../../../wdk.config.json')

const CUSTOM_MODULE = '@tetherto/wdk-wallet-ton'
const CUSTOM_ENTRY = { version: '1.0.0-beta.12' }

beforeEach(() => {
  getConfig.mockReset()
  setConfig.mockReset()
  deleteConfig.mockReset()
  getConfig.mockReturnValue(undefined)
})

/** Mocks config reads so only `overrides` returns the given value. */
function withOverrides (overrides) {
  getConfig.mockImplementation((key) => (key === 'overrides' ? overrides : undefined))
}

describe('getInstalledVersion', () => {
  it('reads the installed version from node_modules', () => {
    const spark = '@tetherto/wdk-wallet-spark'

    expect(getInstalledVersion(spark)).toBe(catalog.modules[spark].version)
  })

  it('returns null for a package that is not installed', () => {
    expect(getInstalledVersion('@tetherto/wdk-wallet-nope')).toBeNull()
  })
})

describe('getAllModules', () => {
  it('merges custom modules with built-in ones', () => {
    getConfig.mockReturnValue({ [CUSTOM_MODULE]: CUSTOM_ENTRY })

    const modules = getAllModules()

    expect(getConfig).toHaveBeenCalledWith('customModules')
    expect(modules[CUSTOM_MODULE]).toEqual(CUSTOM_ENTRY)
    expect(Object.keys(modules)).toEqual([CUSTOM_MODULE, ...Object.keys(catalog.modules)])
  })

  it('lets built-in entries win on name collision', () => {
    const spark = '@tetherto/wdk-wallet-spark'
    getConfig.mockReturnValue({ [spark]: { version: '0.0.1' } })

    expect(getAllModules()[spark].version).toBe(catalog.modules[spark].version)
  })
})

describe('getModuleStatuses', () => {
  it('reports built-in modules as installed at their pinned versions', () => {
    const statuses = getModuleStatuses()

    expect(statuses.map((s) => s.module)).toEqual(Object.keys(catalog.modules))
    for (const status of statuses) {
      expect(status.pinned).toBe(catalog.modules[status.module].version)
      expect(status.installed).toBe(status.pinned)
      expect(status.status).toBe('ok')
      expect(status.source).toBe('built-in')
    }
  })

  it('reports a custom module that is not installed', () => {
    getConfig.mockReturnValue({ '@tetherto/wdk-wallet-nope': { version: '1.0.0' } })

    const statuses = getModuleStatuses()
    const custom = statuses[statuses.length - 1]

    expect(custom).toEqual({
      module: '@tetherto/wdk-wallet-nope',
      pinned: '1.0.0',
      installed: null,
      status: 'not installed',
      source: 'custom'
    })
  })
})

describe('resolveAddTarget', () => {
  it('rejects a built-in module', () => {
    expect(() => resolveAddTarget('@tetherto/wdk-wallet-btc')).toThrow(
      "'@tetherto/wdk-wallet-btc' is a built-in module."
    )
  })

  it('resolves a new package as a fresh add', () => {
    expect(resolveAddTarget(CUSTOM_MODULE, '1.0.0')).toEqual({ repair: false, version: '1.0.0' })
    expect(resolveAddTarget(CUSTOM_MODULE)).toEqual({ repair: false, version: undefined })
  })

  it('resolves a registered module with missing files as a repair at its pin', () => {
    getConfig.mockReturnValue({ '@tetherto/wdk-wallet-nope': { version: '1.0.0' } })

    expect(resolveAddTarget('@tetherto/wdk-wallet-nope')).toEqual({ repair: true, version: '1.0.0' })
  })

  it('rejects a registered module when a different version is requested', () => {
    getConfig.mockReturnValue({ [CUSTOM_MODULE]: CUSTOM_ENTRY })

    expect(() => resolveAddTarget(CUSTOM_MODULE, '9.9.9')).toThrow(
      `Module '${CUSTOM_MODULE}' is already added at ${CUSTOM_ENTRY.version}.`
    )
  })

  it('rejects a registered module that is installed at its pin', () => {
    const installedDep = '@inquirer/prompts'
    const installedVersion = require('../../../package.json').dependencies[installedDep]
    getConfig.mockReturnValue({ [installedDep]: { version: installedVersion } })

    expect(() => resolveAddTarget(installedDep)).toThrow(
      `Module '${installedDep}' is already added.`
    )
  })
})

describe('saveCustomModule', () => {
  it('persists the module merged with existing custom modules', () => {
    getConfig.mockReturnValue({ '@dummy/existing': { version: '1.0.0' } })

    saveCustomModule(CUSTOM_MODULE, CUSTOM_ENTRY.version)

    expect(setConfig).toHaveBeenCalledWith('customModules', {
      '@dummy/existing': { version: '1.0.0' },
      [CUSTOM_MODULE]: CUSTOM_ENTRY
    })
  })
})

describe('module overrides', () => {
  const BUILTIN = '@tetherto/wdk-wallet-btc'
  const EVM = '@tetherto/wdk-wallet-evm'

  it('getAllModules drops disabled built-ins and applies version overrides', () => {
    withOverrides({ modules: { [BUILTIN]: { enabled: false }, [EVM]: { version: '9.9.9' } } })

    const modules = getAllModules()

    expect(modules[BUILTIN]).toBeUndefined()
    expect(modules[EVM]).toEqual({ ...catalog.modules[EVM], version: '9.9.9' })
  })

  const withDisabledCustomModule = () => {
    getConfig.mockImplementation((key) => {
      if (key === 'customModules') return { [CUSTOM_MODULE]: CUSTOM_ENTRY }
      if (key === 'overrides') return { modules: { [CUSTOM_MODULE]: { enabled: false } } }
      return undefined
    })
  }

  it('getAllModules drops a disabled custom module', () => {
    withDisabledCustomModule()

    expect(getAllModules()[CUSTOM_MODULE]).toBeUndefined()
  })

  it('getModuleStatuses reports a disabled custom module', () => {
    withDisabledCustomModule()

    expect(getModuleStatuses().find((s) => s.module === CUSTOM_MODULE)).toEqual({
      module: CUSTOM_MODULE,
      pinned: CUSTOM_ENTRY.version,
      installed: null,
      status: 'disabled',
      source: 'custom'
    })
  })

  it('getModuleStatuses reports disabled, overridden, and stale entries', () => {
    withOverrides({
      modules: {
        [BUILTIN]: { enabled: false },
        [EVM]: { version: '9.9.9' },
        '@gone/pkg': { version: '1.0.0' }
      }
    })

    const byName = Object.fromEntries(getModuleStatuses().map((s) => [s.module, s]))

    expect(byName[BUILTIN]).toEqual({
      module: BUILTIN,
      pinned: catalog.modules[BUILTIN].version,
      installed: catalog.modules[BUILTIN].version,
      status: 'disabled',
      source: 'built-in'
    })
    expect(byName[EVM]).toEqual({
      module: EVM,
      pinned: '9.9.9',
      installed: catalog.modules[EVM].version,
      status: 'version mismatch',
      source: 'built-in',
      defaultVersion: catalog.modules[EVM].version
    })
    expect(byName['@gone/pkg']).toEqual({
      module: '@gone/pkg',
      pinned: '1.0.0',
      installed: null,
      status: 'stale override',
      source: 'override'
    })
  })

  it('resolveAddTarget pins a built-in when a version is given', () => {
    expect(resolveAddTarget(BUILTIN, '9.9.9')).toEqual({
      repair: false,
      builtinPin: true,
      version: '9.9.9',
      defaultVersion: catalog.modules[BUILTIN].version
    })
  })

  it('resolveAddTarget rejects the current effective version of a built-in', () => {
    expect(() => resolveAddTarget(BUILTIN, catalog.modules[BUILTIN].version)).toThrow('is already at')
  })

  it('resolveRemoveTarget lifts a version pin on a built-in', () => {
    withOverrides({ modules: { [BUILTIN]: { version: '9.9.9' } } })

    expect(resolveRemoveTarget(BUILTIN)).toEqual({
      builtinPin: true,
      defaultVersion: catalog.modules[BUILTIN].version
    })
  })

  it('resolveRemoveTarget rejects an unpinned built-in', () => {
    expect(() => resolveRemoveTarget(BUILTIN)).toThrow('cannot be removed')
  })
})

describe('setModuleEnabled', () => {
  const BUILTIN = '@tetherto/wdk-wallet-btc'

  it('disables a built-in module package', () => {
    expect(setModuleEnabled(BUILTIN, false)).toBe(false)
    expect(setConfig).toHaveBeenCalledWith('overrides', {
      modules: { [BUILTIN]: { enabled: false } }
    })
  })

  it('enables a disabled module by removing the delta', () => {
    withOverrides({ modules: { [BUILTIN]: { enabled: false } } })

    expect(setModuleEnabled(BUILTIN, true)).toBe(false)
    expect(deleteConfig).toHaveBeenCalledWith('overrides')
  })

  it('rejects a name already in the desired state', () => {
    expect(() => setModuleEnabled(BUILTIN, true)).toThrow(`'${BUILTIN}' is already enabled.`)
  })

  it('disables a custom module package', () => {
    getConfig.mockImplementation((key) => (key === 'customModules' ? { [CUSTOM_MODULE]: CUSTOM_ENTRY } : undefined))

    expect(setModuleEnabled(CUSTOM_MODULE, false)).toBe(false)
    expect(setConfig).toHaveBeenCalledWith('overrides', {
      modules: { [CUSTOM_MODULE]: { enabled: false } }
    })
  })

  it('rejects a network name, since only package names match', () => {
    expect(() => setModuleEnabled('tron', false)).toThrow("'tron' is not a module.")
  })

  it('rejects a protocol short name, since only package names match', () => {
    expect(() => setModuleEnabled('velora', false)).toThrow("'velora' is not a module.")
  })

  it('clears a stale override on enable', () => {
    withOverrides({ modules: { '@gone/pkg': { enabled: false } } })

    expect(setModuleEnabled('@gone/pkg', true)).toBe(true)
    expect(deleteConfig).toHaveBeenCalledWith('overrides')
  })

  it('rejects disabling a stale override name', () => {
    withOverrides({ modules: { '@gone/pkg': { version: '1.0.0' } } })

    expect(() => setModuleEnabled('@gone/pkg', false)).toThrow("'@gone/pkg' is not a module.")
  })
})

describe('removeCustomModule', () => {
  it('rejects a built-in module', () => {
    expect(() => removeCustomModule('@tetherto/wdk-wallet-btc')).toThrow(
      "'@tetherto/wdk-wallet-btc' is a built-in module and cannot be removed."
    )
  })

  it('rejects a module that was never added', () => {
    expect(() => removeCustomModule(CUSTOM_MODULE)).toThrow(
      `Module '${CUSTOM_MODULE}' is not a custom module.`
    )
  })

  it('persists the custom modules without the removed one', () => {
    getConfig.mockReturnValue({
      [CUSTOM_MODULE]: CUSTOM_ENTRY,
      '@dummy/existing': { version: '1.0.0' }
    })

    removeCustomModule(CUSTOM_MODULE)

    expect(setConfig).toHaveBeenCalledWith('customModules', {
      '@dummy/existing': { version: '1.0.0' }
    })
  })

  it('clears any override left behind for the removed module', () => {
    getConfig.mockImplementation((key) => {
      if (key === 'customModules') return { [CUSTOM_MODULE]: CUSTOM_ENTRY }
      if (key === 'overrides') return { modules: { [CUSTOM_MODULE]: { enabled: false } } }
      return undefined
    })

    removeCustomModule(CUSTOM_MODULE)

    expect(deleteConfig).toHaveBeenCalledWith('overrides')
  })
})
