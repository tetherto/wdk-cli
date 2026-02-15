import { Command } from 'commander'
import { APP_NAME, APP_VERSION } from './config/constants.js'
import { registerConfigCommand } from './commands/config.js'
import { registerKeyCommand } from './commands/key.js'
import { registerWalletCommand } from './commands/wallet.js'
import { registerBalanceCommand } from './commands/balance.js'
import { registerSendCommand } from './commands/send.js'
import { registerNetworksCommand } from './commands/networks.js'

export function createProgram(): Command {
  const program = new Command()
  program
    .name(APP_NAME)
    .description('CLI tool for Tether\'s Wallet Development Kit (WDK)')
    .version(APP_VERSION)
    .option('--network <network>', 'Override default network')
    .option('--index <n>', 'Account index (default: 0)', '0')
    .option('--json', 'Output as JSON')
    .option('--no-color', 'Disable colored output')
    .option('--verbose', 'Enable debug logging')

  registerConfigCommand(program)
  registerKeyCommand(program)
  registerWalletCommand(program)
  registerBalanceCommand(program)
  registerSendCommand(program)
  registerNetworksCommand(program)

  return program
}

export async function run(argv: string[]): Promise<void> {
  const program = createProgram()
  await program.parseAsync(argv)
}
