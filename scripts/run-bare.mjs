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
 * Runs a script under the Bare runtime pinned in package.json, resolving the
 * prebuilt binary for this platform explicitly rather than relying on a
 * `bare` bin shim (which npm may skip when platform-optional packages cannot
 * be resolved). Handy for ad-hoc checks of daemon code under Bare.
 *
 *   node scripts/run-bare.mjs <script> [args…]
 */
import bareSpawn from 'bare-runtime/spawn'

const [, , script, ...args] = process.argv
if (!script) {
  console.error('usage: node scripts/run-bare.mjs <script> [args…]')
  process.exit(2)
}

bareSpawn('bare', {
  args: [script, ...args],
  stdio: 'inherit',
  forwardExitCode: true,
  suppressSignals: true
})
