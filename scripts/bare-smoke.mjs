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
 * Smoke test for the wallet daemon under the Bare runtime. Runs on Node, as
 * the CLI does, and exercises the real path: `DaemonClient.ensureRunning()`
 * spawns the daemon through bare-runtime, then every check goes over the
 * socket. Uses a throwaway config directory so no real wallet is touched.
 *
 *   npm run test:bare
 */
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The config dir must be set before the CLI modules read it.
const configHome = mkdtempSync(join(tmpdir(), 'wdk-bare-'))
process.env.XDG_CONFIG_HOME = configHome

const { daemonClient } = await import('../src/daemon/client.js')
const { getDaemonSocketPath, getDaemonPidPath } = await import('../src/config/constants.js')
const { BARE_DIR, BARE_IMPORTS_FILE, BARE_ENTRY_FILE } = await import('../src/daemon/bare/imports.js')

let pass = 0
let fail = 0
const failures = []

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
    failures.push(label)
    console.error('  ✗', label)
  }
}

/**
 * Runs a call expected to throw and returns the error, or null if it did not.
 *
 * @param {() => Promise<unknown>} fn - The call.
 * @returns {Promise<Error & { code?: string } | null>} The thrown error.
 */
async function rejection (fn) {
  try {
    await fn()
    return null
  } catch (e) {
    return /** @type {Error & { code?: string }} */ (e)
  }
}

console.log('wdk-cli: wallet daemon under bare-runtime\n')
console.log('config dir:', configHome)

try {
  console.log('\nstartup:')
  await daemonClient.ensureRunning()
  ok(true, 'ensureRunning spawns the daemon under Bare and it answers')
  ok(existsSync(join(configHome, 'wdk-cli', BARE_DIR, BARE_IMPORTS_FILE)), 'import map written to the config dir')
  ok(existsSync(join(configHome, 'wdk-cli', BARE_DIR, BARE_ENTRY_FILE)), 'Bare entry point written to the config dir')
  const socketMode = statSync(getDaemonSocketPath()).mode & 0o777
  ok(socketMode === 0o700, `socket is owner-only (mode ${socketMode.toString(8)})`)
  const pidMode = statSync(getDaemonPidPath()).mode & 0o777
  ok(pidMode === 0o600, `pid file is owner-only (mode ${pidMode.toString(8)})`)

  console.log('\nrequests over the socket:')
  const status = await daemonClient.status()
  ok(status.unlocked === false && Array.isArray(status.wallets), 'status reports no unlocked wallets')
  ok(Number.isInteger(status.pid) && status.pid > 0, `status carries the daemon pid (${status.pid})`)
  ok((await daemonClient.listWallets()).length === 0, 'list_wallets is empty')

  const unlock = await rejection(() => daemonClient.unlockWallet('no-such-wallet', 'x', 1))
  ok(unlock !== null && unlock.code === 'ENOENT', `unlocking a missing wallet fails cleanly (${unlock?.code})`)
  const address = await rejection(() => daemonClient.getAddress('ethereum', 0, 'no-such-wallet'))
  ok(address !== null && address.code === 'WALLET_NOT_UNLOCKED', `get_address on a locked wallet is refused (${address?.code})`)

  console.log('\nshutdown:')
  await daemonClient.lock()
  const deadline = Date.now() + 5000
  while (Date.now() < deadline && existsSync(getDaemonSocketPath())) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  ok(!existsSync(getDaemonSocketPath()), 'socket removed after lock')
  ok(!existsSync(getDaemonPidPath()), 'pid file removed after lock')
  ok(!(await daemonClient.isRunning()), 'client sees the daemon as stopped')
} catch (e) {
  ok(false, `unexpected failure: ${e instanceof Error ? e.message : String(e)}`)
} finally {
  rmSync(configHome, { recursive: true, force: true })
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) {
  console.error('\nFailures:')
  for (const f of failures) console.error('  -', f)
  process.exit(1)
}
