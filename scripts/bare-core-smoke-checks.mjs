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
 * Runs the daemon core on Bare as an embedding host such as a mobile worklet
 * would: no socket, no files. The config lives in memory, the wallet store
 * returns an encrypted seed held in memory, and wallet modules come from a
 * static map of literal imports that a bundler can follow. Loaded by
 * `./bare-core-smoke.mjs`.
 *
 *   npm run test:bare-core
 */
/* global Bare */
import { encrypt } from '@tetherto/wdk-utils'
import { configService } from '../src/services/config-service.js'
import { useModuleHost } from '../src/services/module-host.js'
import { CONFIG_DEFAULTS } from '../src/config/constants.js'
import { walletsFile } from '../src/config/wdk-config.js'

const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const PASSPHRASE = 'correct-horse-battery-staple'
const ETHEREUM_0 = '0x405005C7c4422390F4B334F64Cf20E0b767131d0'
const BITCOIN_0 = 'bc1qxn0te9ecv864wtu53cccjhuuy5dphvem6ykeyr'
const TRON_0 = 'TXngH8bVadn9ZWtKBgjKQcqN1GsZ7A1jcb'

/** The wallet modules this host was built with. */
const MODULES = {
  '@tetherto/wdk-wallet-evm': () => import('@tetherto/wdk-wallet-evm'),
  '@tetherto/wdk-wallet-btc': () => import('@tetherto/wdk-wallet-btc'),
  '@tetherto/wdk-wallet-tron': () => import('@tetherto/wdk-wallet-tron')
}

let values = structuredClone(CONFIG_DEFAULTS)
configService.useStore({
  get: (key) => values[key],
  set: (key, value) => { values[key] = value },
  delete: (key) => { delete values[key] },
  clear: () => { values = structuredClone(CONFIG_DEFAULTS) },
  snapshot: () => ({ ...values }),
  path: 'memory'
})
useModuleHost({
  load: (name) => {
    const load = MODULES[name]
    if (!load) return Promise.reject(Object.assign(new Error(`Module ${name} is not bundled`), { code: 'MODULE_NOT_FOUND' }))
    return load()
  },
  installedVersion: (name) => (MODULES[name] ? walletsFile.modules[name].version : null)
})

const { WalletDaemonCore } = await import('../src/daemon/core/wallet-daemon-core.js')

let pass = 0
let fail = 0

/**
 * Records one check.
 *
 * @param {boolean} cond - Whether the check passed.
 * @param {string} label - What was checked.
 */
function ok (cond, label) {
  if (cond) {
    pass++
    console.log('  ✓', label)
  } else {
    fail++
    console.error('  ✗', label)
  }
}

console.log(`wdk-cli: daemon core on Bare (${Bare.platform}-${Bare.arch})\n`)

let shutdownRequested = false
const core = new WalletDaemonCore({
  walletStore: { readSeedFile: async () => JSON.stringify(encrypt(SEED, PASSPHRASE)) },
  pid: Bare.pid,
  requestShutdown: () => { shutdownRequested = true }
})

try {
  const status = await core.handleRequest({ action: 'status' })
  ok(status.ok && status.data.unlocked === false && status.data.pid === Bare.pid, 'status answers before any unlock')

  const wrong = await core.handleRequest({ action: 'unlock_wallet', wallet: 'main', passphrase: 'wrong', ttl: 5 })
  ok(wrong.code === 'WRONG_PASSPHRASE', `refuses the wrong passphrase (${wrong.code})`)

  const unlock = await core.handleRequest({ action: 'unlock_wallet', wallet: 'main', passphrase: PASSPHRASE, ttl: 5 })
  ok(unlock.ok, `unlocks with the right passphrase${unlock.ok ? '' : ` (${unlock.error})`}`)

  for (const [network, expected] of [['ethereum', ETHEREUM_0], ['bitcoin', BITCOIN_0], ['tron', TRON_0]]) {
    const res = await core.handleRequest({ action: 'get_address', wallet: 'main', network, index: 0 })
    ok(res.ok && res.data.address === expected, `derives the ${network} address${res.ok ? ` (${res.data.address})` : ` (${res.error})`}`)
  }

  const lock = await core.handleRequest({ action: 'lock_wallet', wallet: 'main' })
  ok(lock.ok && shutdownRequested, 'locking the last wallet asks the host to shut down')
} catch (e) {
  ok(false, `unexpected failure: ${e instanceof Error ? e.stack : String(e)}`)
} finally {
  core.dispose()
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) Bare.exitCode = 1
