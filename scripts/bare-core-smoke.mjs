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

// Bare entry for the daemon core smoke test:
//
//   node scripts/run-bare.mjs scripts/bare-core-smoke.mjs
//
// Loads the checks through `bare-node-runtime`'s import map, as every WDK
// module does in its own `bare.js`: the core imports nothing runtime-specific
// itself, but some of its dependencies (bip39) reach for `node:crypto`.
// Excluded from `standard` (package.json → standard.ignore): its parser
// (espree 9) cannot read the import-attributes argument of `import()`.
import 'bare-node-runtime/global'

await import('./bare-core-smoke-checks.mjs', { with: { imports: 'bare-node-runtime/imports' } })
