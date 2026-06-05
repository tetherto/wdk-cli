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

import { createRequire } from 'node:module'
import { Command } from 'commander'
import { APP_NAME, APP_VERSION } from './config/constants.js'
import { walletsFile } from './config/wdk-config.js'
import { parseModuleName } from './config/networks.js'
import { registerConfigCommand } from './commands/config.js'
import { registerWalletCommand } from './commands/wallet.js'
import { registerGetCommand } from './commands/get.js'
import { registerSendCommand } from './commands/send.js'
import { registerNetworkCommand } from './commands/network.js'
import { registerTokenCommand } from './commands/token.js'
import { registerMcpCommand } from './commands/mcp.js'
import { registerRampCommands } from './commands/ramp.js'

const cliRequire = createRequire(import.meta.url)

/**
 * Builds the `--version` output: the CLI version followed by each WDK
 * package's declared version, in aligned columns. Sources:
 *   - `package.json` top-level deps → top-level packages (e.g. `@tetherto/wdk`)
 *   - `wdk.config.json` network modules → per-network wallet packages (pinned)
 *
 * @returns {string}
 */
function buildVersionString () {
  const pkg = cliRequire('../package.json')
  /** @type {Map<string, string>} */
  const versions = new Map()
  // Top-level @tetherto/wdk* deps
  const deps = { ...(pkg.dependencies || {}), ...(pkg.peerDependencies || {}) }
  for (const [name, version] of Object.entries(deps)) {
    if (name.startsWith('@tetherto/wdk')) versions.set(name, version)
  }
  // Per-network module names from wdk.config.json
  for (const entry of Object.values(walletsFile.networks)) {
    const { name, version } = parseModuleName(entry.module)
    if (name.startsWith('@tetherto/wdk') && version) versions.set(name, version)
  }

  /** @type {{ label: string, version: string }[]} */
  const rows = [{ label: APP_NAME, version: `v${APP_VERSION}` }]
  for (const name of [...versions.keys()].sort()) {
    rows.push({ label: `  ${name}`, version: `v${versions.get(name)}` })
  }
  const width = Math.max(...rows.map((r) => r.label.length)) + 4
  return rows.map((r) => `${r.label.padEnd(width)}${r.version}`).join('\n')
}

/**
 * Creates and configures the root Commander program with all subcommands registered.
 *
 * @returns {Command} The configured Commander program.
 */
export function createProgram () {
  const program = new Command()
  program
    .name('wdk')
    .description('CLI tool for Wallet Development Kit (WDK)')
    .version(buildVersionString())
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Enable debug logging')
    .showHelpAfterError()

  registerWalletCommand(program)
  registerGetCommand(program)
  registerSendCommand(program)
  registerRampCommands(program)
  registerConfigCommand(program)
  registerNetworkCommand(program)
  registerTokenCommand(program)
  registerMcpCommand(program)

  return program
}

export { startMcpServer } from './mcp/server.js'
export { startDaemon } from './daemon/server.js'

/**
 * Parses CLI arguments and runs the appropriate command.
 *
 * @param {string[]} argv - Process argument vector (typically `process.argv`).
 * @returns {Promise<void>}
 */
export async function run (argv) {
  const program = createProgram()
  await program.parseAsync(argv)
}
