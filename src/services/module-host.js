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
 * How WDK module packages reach the process. The CLI, the MCP server and the
 * desktop daemon import installed packages from disk (`./node-module-host.js`);
 * a bundled host such as a mobile worklet serves the modules it was built with.
 *
 * @typedef {Object} ModuleHost
 * @property {(name: string) => Promise<any>} load - Loads a module package by name, as `import()` would.
 *   Rejects with `code` `ERR_MODULE_NOT_FOUND` or `MODULE_NOT_FOUND` when it is not available.
 * @property {(name: string) => string | null} installedVersion - The available version of a
 *   package, or null when it is not available.
 */

/** @type {ModuleHost | null} */
let host = null

/**
 * Sets the module host. Every host process calls it once at startup.
 *
 * @param {ModuleHost} moduleHost - The module host.
 * @returns {void}
 */
export function useModuleHost (moduleHost) {
  host = moduleHost
}

/**
 * The registered module host.
 *
 * @returns {ModuleHost} The module host.
 * @throws {Error} If no module host has been registered.
 */
export function getModuleHost () {
  if (!host) {
    throw new Error('No module host registered: call useModuleHost() at startup.')
  }
  return host
}
