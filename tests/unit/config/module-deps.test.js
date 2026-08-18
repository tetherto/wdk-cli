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
      '@tetherto/wdk-wallet-tron'
    ])
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
})
