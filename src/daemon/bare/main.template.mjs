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

// Template for the daemon's Bare entry point. `writeBareLaunchFiles()` in
// ./imports.js fills in the two absolute paths and writes the result next to
// the generated import map, as <config dir>/bare/main.mjs; the CLI then runs
//
//   bare <config dir>/bare/main.mjs
//
// Why generated: `bare-module` reads the `imports` attribute of `import()`
// statically, so it must be a string literal, and it resolves that literal
// relative to this file — while the map's `node:util` value has to be an
// absolute path (see ./imports.js). Keeping entry and map side by side in a
// directory the CLI owns satisfies both. Delete the indirection once
// `bare-utils` exports `isDeepStrictEqual`: the entry can then be a static
// file using `with { imports: 'bare-node-runtime/imports' }`.
//
// Excluded from `standard` (package.json → standard.ignore): its parser
// (espree 9) cannot read the import-attributes argument of `import()`.
import '__BARE_NODE_RUNTIME_GLOBAL__'

const { startDaemon } = await import('__DAEMON_SERVER__', { with: { imports: './imports.json' } })

startDaemon().catch((error) => {
  console.error('Daemon error:', error)
  process.exit(1)
})
