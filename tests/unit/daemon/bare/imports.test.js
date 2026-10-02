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

import { isAbsolute } from 'node:path'
import { readFile } from 'node:fs/promises'
import { buildBareImportMap, renderBareEntry, BARE_DIR, BARE_IMPORTS_FILE, BARE_ENTRY_FILE } from '../../../../src/daemon/bare/imports.js'

describe('bare launch files', () => {
  const base = {
    'node:fs': { bare: 'bare-fs', default: 'fs' },
    util: { bare: 'bare-utils', default: 'util' },
    'node:util': { bare: 'bare-utils', default: 'util' }
  }

  describe('buildBareImportMap', () => {
    it('redirects util and node:util to the shim and keeps the rest', () => {
      const map = buildBareImportMap(base, '/abs/util.js')

      expect(map['node:fs']).toEqual({ bare: 'bare-fs', default: 'fs' })
      expect(map.util).toEqual({ bare: '/abs/util.js', default: 'util' })
      expect(map['node:util']).toEqual({ bare: '/abs/util.js', default: 'util' })
    })

    it('does not mutate the base table', () => {
      buildBareImportMap(base, '/abs/util.js')

      expect(base.util).toEqual({ bare: 'bare-utils', default: 'util' })
    })
  })

  describe('renderBareEntry', () => {
    it('fills both placeholders of the shipped template and leaves none behind', async () => {
      const template = await readFile(new URL('../../../../src/daemon/bare/main.template.mjs', import.meta.url), 'utf8')

      const entry = renderBareEntry(template, { globalEntry: '/abs/global.js', serverEntry: '/abs/server.js' })

      expect(entry).toContain("import '/abs/global.js'")
      expect(entry).toContain("import('/abs/server.js', { with: { imports: './imports.json' } })")
      expect(entry).not.toMatch(/__[A-Z_]+__/)
    })
  })

  it('names the generated files under a dedicated directory', () => {
    expect(BARE_DIR).toBe('bare')
    expect(BARE_IMPORTS_FILE).toBe('imports.json')
    expect(BARE_ENTRY_FILE).toBe('main.mjs')
    expect(isAbsolute(BARE_DIR)).toBe(false)
  })
})
