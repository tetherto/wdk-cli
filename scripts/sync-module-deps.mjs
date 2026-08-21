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
 * Syncs the module pins from wdk.config.json into package.json dependencies,
 * so modules install through npm's standard resolution with no lifecycle
 * scripts. Run after changing a module pin and commit both files together.
 * Run: node scripts/sync-module-deps.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isWdkModulePackage } from '../src/services/module-service.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = join(root, 'wdk.config.json')
const pkgPath = join(root, 'package.json')

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

const modules = catalog.modules || {}

// Drop WDK module packages no longer in the catalog. Scoped to wdk-wallet-* /
// wdk-protocol-* names so hand-authored deps (core packages, unrelated deps)
// are never removed.
let removed = 0
for (const name of Object.keys(pkg.dependencies)) {
  if (isWdkModulePackage(name) && !(name in modules)) {
    delete pkg.dependencies[name]
    removed++
  }
}

// Add or update every catalog module at its pinned version.
for (const [name, entry] of Object.entries(modules)) {
  pkg.dependencies[name] = entry.version
}

pkg.dependencies = Object.fromEntries(
  Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b))
)

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(
  `Synced ${Object.keys(modules).length} module pins into package.json` +
  (removed > 0 ? ` (removed ${removed} stale)` : '')
)
