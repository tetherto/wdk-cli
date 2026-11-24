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
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @typedef {import('./module-host.js').ModuleHost} ModuleHost */

const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Creates the module host for processes that run from the installed CLI
 * package: modules are imported from its `node_modules`.
 *
 * @returns {ModuleHost} The module host.
 */
export function createNodeModuleHost () {
  return {
    load: (name) => import(name),
    installedVersion: (name) => {
      // Read directly (not via require): packages with an `exports` map do not
      // expose `./package.json` as an importable subpath.
      try {
        const raw = readFileSync(join(CLI_ROOT, 'node_modules', name, 'package.json'), 'utf8')
        return JSON.parse(raw).version || null
      } catch {
        return null
      }
    }
  }
}
