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

// A wallet module must match one of two forms, both locked to Tether-owned namespaces:
//   @tetherto/<name>[@<version>]                            npm registry package
//   git+https://github.com/tetherto/<repo>[.git][#<ref>]    GitHub repo (pin a commit SHA for reproducible installs)
// The character classes exclude all shell metacharacters, so a matching
// specifier is safe to place on a command line.
const MODULE_SPEC_RE = /^@tetherto\/[a-z0-9~-][a-z0-9._~-]*(@[a-zA-Z0-9.+-]+)?$/
const GITHUB_SPEC_RE = /^git\+https:\/\/github\.com\/tetherto\/[a-z0-9._~-]+(\.git)?(#[a-zA-Z0-9._/-]+)?$/

const invalid = modules.filter(
  (m) => typeof m !== 'string' || !(MODULE_SPEC_RE.test(m) || GITHUB_SPEC_RE.test(m))
)
if (invalid.length > 0) {
  console.error(`Invalid module specifier(s) in wdk.config.json: ${invalid.join(', ')}`)
  process.exit(1)
}

console.log(`Installing ${modules.length} wallet modules from wdk.config.json...`)
console.log(modules.map((m) => `  - ${m}`).join('\n'))

try {
  // Node refuses to spawn npm.cmd without a shell (CVE-2024-27980), so Windows
  // must go through cmd.exe; macOS and Linux run npm directly, with no shell.
  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--no-save', ...modules],
    {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
      shell: process.platform === 'win32'
    }
  )
  console.log('\nAll wallet modules installed successfully.')
} catch (err) {
  console.error('\nFailed to install wallet modules.')
  process.exit(1)
}
