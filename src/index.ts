import { Command } from 'commander'
import { APP_NAME, APP_VERSION } from './config/constants.js'
import { registerConfigCommand } from './commands/config.js'
import { registerWalletCommand } from './commands/wallet.js'
import { registerGetCommand } from './commands/get.js'
import { registerSendCommand } from './commands/send.js'
import { registerNetworkCommand } from './commands/network.js'
import { registerPolicyCommand } from './commands/policy.js'
import { registerSetupCommand } from './commands/setup.js'

export function createProgram(): Command {
  const program = new Command()
  program
    .name(APP_NAME)
    .description('CLI tool for Wallet Development Kit (WDK)')
    .version(APP_VERSION)
    .option('--network <network>', 'Override default network')
    .option('--index <n>', 'Account index (default: 0)', '0')
    .option('--json', 'Output as JSON')
    .option('--no-color', 'Disable colored output')
    .option('--verbose', 'Enable debug logging')
    .showHelpAfterError()

  registerConfigCommand(program)
  registerWalletCommand(program)
  registerGetCommand(program)
  registerSendCommand(program)
  registerNetworkCommand(program)
  registerPolicyCommand(program)
  registerSetupCommand(program)

  program
    .command('mcp')
    .description('Start MCP server for AI model integration (Claude, Gemini, GPT)')
    .action(async () => {
      const { startMcpServer } = await import('./mcp/server.js')
      await startMcpServer()
    })

  return program
}

export { startMcpServer } from './mcp/server.js'
export { startDaemon } from './daemon/server.js'

export async function run(argv: string[]): Promise<void> {
  const program = createProgram()
  await program.parseAsync(argv)
}
