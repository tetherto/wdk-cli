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

import { Command } from 'commander'
import { APP_NAME, APP_VERSION } from './config/constants.js'
import { registerConfigCommand } from './commands/config.js'
import { registerWalletCommand } from './commands/wallet.js'
import { registerGetCommand } from './commands/get.js'
import { registerSendCommand } from './commands/send.js'
import { registerNetworkCommand } from './commands/network.js'
import { registerMcpCommand } from './commands/mcp-setup.js'
import { registerRampCommands } from './commands/ramp.js'

export function createProgram(): Command {
  const program = new Command()
  program
    .name(APP_NAME)
    .description('CLI tool for Wallet Development Kit (WDK)')
    .version(APP_VERSION)
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Enable debug logging')
    .showHelpAfterError()

  registerWalletCommand(program)
  registerGetCommand(program)
  registerSendCommand(program)
  registerRampCommands(program)
  registerConfigCommand(program)
  registerNetworkCommand(program)
  registerMcpCommand(program)

  return program
}

export { startMcpServer } from './mcp/server.js'
export { startDaemon } from './daemon/server.js'

export async function run(argv: string[]): Promise<void> {
  const program = createProgram()
  await program.parseAsync(argv)
}
