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

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { getConfigDir } from '../../config/constants.js'

/** @typedef {{ bare: string, default: string }} ImportMapEntry */
/** @typedef {Record<string, ImportMapEntry>} ImportMap */

/** Subdirectory of the config dir holding the generated Bare launch files. */
export const BARE_DIR = 'bare'
/** File name of the generated import map. */
export const BARE_IMPORTS_FILE = 'imports.json'
/** File name of the generated Bare entry point. */
export const BARE_ENTRY_FILE = 'main.mjs'

/**
 * Builds the import map the daemon runs under: `bare-node-runtime`'s table,
 * which maps every `node:*` builtin to its `bare-*` counterpart, with
 * `util` / `node:util` redirected to `./util.js` (see there for why).
 *
 * Bare resolves a map value from the importing module's location, so the
 * shim has to be named by absolute path — a relative path or a package
 * self-reference would be looked up from inside `node_modules/conf/`.
 *
 * @param {ImportMap} base - The `bare-node-runtime/imports` table.
 * @param {string} utilShimPath - Absolute path to `./util.js`.
 * @returns {ImportMap} A new map with the `util` entries overridden.
 */
export function buildBareImportMap (base, utilShimPath) {
  const util = { bare: utilShimPath, default: 'util' }
  return { ...base, util, 'node:util': util }
}

/**
 * Renders the Bare entry point from `./main.template.mjs`.
 *
 * @param {string} template - The template source.
 * @param {{ globalEntry: string, serverEntry: string }} paths - Absolute paths
 *   of `bare-node-runtime/global` and of `../server.js`.
 * @returns {string} The entry source, with both placeholders filled in.
 */
export function renderBareEntry (template, { globalEntry, serverEntry }) {
  return template
    .replace('__BARE_NODE_RUNTIME_GLOBAL__', globalEntry)
    .replace('__DAEMON_SERVER__', serverEntry)
}

/**
 * Writes the daemon's Bare launch files — the import map and the entry point
 * that loads `server.js` through it — into `<config dir>/bare/` and returns
 * the entry's path, ready to be passed to the `bare` binary. Regenerated on
 * every spawn so the embedded paths follow the installed CLI.
 *
 * @returns {Promise<string>} Absolute path of the generated entry point.
 * @throws {Error} When the directory or either file cannot be written.
 */
export async function writeBareLaunchFiles () {
  const base = JSON.parse(await readFile(new URL(import.meta.resolve('bare-node-runtime/imports')), 'utf8'))
  const map = buildBareImportMap(base, fileURLToPath(new URL('./util.js', import.meta.url)))
  const template = await readFile(new URL('./main.template.mjs', import.meta.url), 'utf8')
  const entry = renderBareEntry(template, {
    globalEntry: fileURLToPath(new URL(import.meta.resolve('bare-node-runtime/global'))),
    serverEntry: fileURLToPath(new URL('../server.js', import.meta.url))
  })

  const dir = join(getConfigDir(), BARE_DIR)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(join(dir, BARE_IMPORTS_FILE), JSON.stringify(map), { encoding: 'utf8', mode: 0o600 })
  const entryPath = join(dir, BARE_ENTRY_FILE)
  await writeFile(entryPath, entry, { encoding: 'utf8', mode: 0o600 })
  return entryPath
}
