#!/usr/bin/env node
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

/**
 * Reads wdk.config.json and installs all wallet modules listed in it.
 * Run: node scripts/install-wallets.mjs
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const walletsPath = join(__dirname, '..', 'wdk.config.json')
const wallets = JSON.parse(readFileSync(walletsPath, 'utf8'))

const modules = [...new Set(Object.values(wallets.networks).map((w) => w.module))]

if (modules.length === 0) {
  console.log('No wallet modules to install.')
  process.exit(0)
}

console.log(`Installing ${modules.length} wallet modules from wdk.config.json...`)
console.log(modules.map((m) => `  - ${m}`).join('\n'))

try {
  execFileSync('npm', ['install', '--no-save', ...modules], {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    shell: true
  })
  console.log('\nAll wallet modules installed successfully.')
} catch (err) {
  console.error('\nFailed to install wallet modules.')
  process.exit(1)
}
