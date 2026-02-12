import { Command } from 'commander'
import { APP_NAME, APP_VERSION } from './config/constants.js'
import { registerConfigCommand } from './commands/config.js'

export function createProgram(): Command {
  const program = new Command()
  program
    .name(APP_NAME)
    .description('CLI tool for Tether\'s Wallet Development Kit (WDK)')
    .version(APP_VERSION)
    .option('--chain <chain>', 'Override default chain')
    .option('--index <n>', 'Account index (default: 0)', '0')
    .option('--json', 'Output as JSON')
    .option('--no-color', 'Disable colored output')
    .option('--verbose', 'Enable debug logging')

  registerConfigCommand(program)

  return program
}

export function run(argv: string[]): void {
  const program = createProgram()
  program.parse(argv)
}
