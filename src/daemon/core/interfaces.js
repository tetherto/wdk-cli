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

// What a host provides to run the daemon core. The core itself never touches
// the runtime: nothing reachable from `src/daemon/core/` imports `node:*`,
// `bare-*`, `conf`, `chalk` or `commander` (tests/unit/daemon/core/portability.test.js).
//
// Before importing the core, a host registers a config store
// (`configService.useStore`) and a module host (`useModuleHost`): some modules
// read the config while they load. `src/services/install-node-host.js` does
// both for processes that run from the installed CLI package.

/**
 * Where encrypted wallets are kept.
 *
 * @typedef {Object} WalletStore
 * @property {(name: string) => Promise<string>} readSeedFile - Reads the encrypted seed file of a
 *   wallet, as written by `wdk wallet create`. Rejects (e.g. with `code` `ENOENT`) when it does not exist.
 */

/**
 * @typedef {Object} DaemonCoreOptions
 * @property {WalletStore} walletStore - Where encrypted wallets are kept.
 * @property {number} pid - The process id reported by the `status` action.
 * @property {() => void} requestShutdown - Called when the daemon should stop: the last wallet
 *   was locked, or a client asked to lock everything.
 */

export {}
