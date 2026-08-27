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

import { createRequire } from 'node:module'
import { isWdkModulePackage } from '../../../src/services/module-service.js'

const require = createRequire(import.meta.url)
const catalog = require('../../../wdk.config.json')
const pkg = require('../../../package.json')
const lock = require('../../../package-lock.json')

describe('module dependency sync', () => {
  it('declares the expected module registry', () => {
    expect(Object.keys(catalog.modules)).toEqual([
      '@tetherto/wdk-wallet-btc',
      '@tetherto/wdk-wallet-evm',
      '@tetherto/wdk-wallet-evm-erc-4337',
      '@tetherto/wdk-wallet-solana',
      '@tetherto/wdk-wallet-spark',
      '@tetherto/wdk-wallet-tron',
      '@tetherto/wdk-protocol-fiat-moonpay',
      '@tetherto/wdk-protocol-swap-velora-evm',
      '@tetherto/wdk-protocol-bridge-usdt0-evm',
      '@rhino.fi/wdk-protocol-swidge-rhinofi',
      '@symbiosis-finance/wdk-protocol-swidge-symbiosis'
    ])
  })

  it('only registers WDK module packages (wdk-wallet-* / wdk-protocol-*)', () => {
    for (const name of Object.keys(catalog.modules)) {
      expect(isWdkModulePackage(name)).toBe(true)
    }
  })

  it('pins every catalog module in package.json dependencies at the same version', () => {
    for (const [name, entry] of Object.entries(catalog.modules)) {
      expect(pkg.dependencies[name]).toBe(entry.version)
    }
  })

  it('pins every catalog module in package-lock.json at the same version', () => {
    for (const [name, entry] of Object.entries(catalog.modules)) {
      expect(lock.packages[''].dependencies[name]).toBe(entry.version)
    }
  })

  it('has no stale WDK module dep absent from the catalog', () => {
    for (const name of Object.keys(pkg.dependencies)) {
      if (isWdkModulePackage(name)) {
        expect(catalog.modules[name]).toBeDefined()
      }
    }
  })
})
