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

import { readFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const CORE_ENTRY = resolve(ROOT, 'src/daemon/core/wallet-daemon-core.js')

const FORBIDDEN = /^(node:|bare-|conf$|chalk$|commander$)/
const SPECIFIER = /^\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm

/**
 * Walks every source file statically reachable from `entry` and collects the
 * imports of runtime-specific packages.
 *
 * @param {string} entry - Absolute path of the first file.
 * @returns {{ files: string[], forbidden: string[] }} The reachable files and each forbidden import as `file -> specifier`.
 */
function walk (entry) {
  const seen = new Set()
  const forbidden = []
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const specifier = match[1] || match[2]
      if (specifier.startsWith('.')) {
        if (!specifier.endsWith('.json')) visit(resolve(dirname(file), specifier))
      } else if (FORBIDDEN.test(specifier)) {
        forbidden.push(`${relative(ROOT, file)} -> ${specifier}`)
      }
    }
  }
  visit(entry)
  return { files: [...seen].map((f) => relative(ROOT, f)), forbidden }
}

describe('daemon core portability', () => {
  it('imports nothing runtime-specific, so any host can run it', () => {
    const { files, forbidden } = walk(CORE_ENTRY)

    expect(files).toContain('src/services/wdk-service.js')
    expect(forbidden).toEqual([])
  })
})
