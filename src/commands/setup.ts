import type { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, platform } from 'node:os'
import { execSync } from 'node:child_process'
import chalk from 'chalk'
import { getKeyringPath } from '../config/constants.js'
import { handleError } from '../errors/index.js'

function getClaudeDesktopConfigPath(): string | null {
  const home = homedir()
  const os = platform()

  if (os === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  }
  if (os === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming')
    return join(appData, 'Claude', 'claude_desktop_config.json')
  }
  if (os === 'linux') {
    const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, '.config')
    return join(xdgConfig, 'Claude', 'claude_desktop_config.json')
  }
  return null
}

function getWdkMcpCommand(): { command: string; args?: string[] } {
  // Try to find the wdk-mcp binary path
  try {
    const binPath = execSync('which wdk-mcp 2>/dev/null || where wdk-mcp 2>nul', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim()

    if (binPath) {
      // Use full path for reliability (Claude Desktop doesn't load shell profiles)
      return { command: binPath }
    }
  } catch { /* not found globally */ }

  // Fallback: use node + script path (works when installed from source)
  const nodePath = process.execPath
  const scriptPath = join(dirname(new URL(import.meta.url).pathname), '..', '..', 'bin', 'wdk-mcp.mjs')
  if (existsSync(scriptPath)) {
    return { command: nodePath, args: [scriptPath] }
  }

  // Last resort: assume npx
  return { command: 'npx', args: ['-y', '-p', 'wdk-cli', 'wdk-mcp'] }
}

function testMcpServer(mcpConfig: { command: string; args?: string[] }): boolean {
  try {
    const args = mcpConfig.args ? mcpConfig.args.join(' ') : ''
    const cmd = `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"setup-test","version":"1.0"}}}' | ${mcpConfig.command} ${args}`
    const result = execSync(cmd, { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] })
    return result.includes('"wdk-wallet"')
  } catch {
    return false
  }
}

export function registerSetupCommand(program: Command): void {
  const setup = program
    .command('setup')
    .description('Set up wdk-wallet integrations')

  setup
    .command('claude-desktop')
    .description('Configure wdk-wallet MCP server for Claude Desktop')
    .option('--remove', 'Remove wdk-wallet from Claude Desktop')
    .option('--skip-verify', 'Skip MCP server verification')
    .action(async (options: { remove?: boolean; skipVerify?: boolean }) => {
      const verbose = program.opts().verbose
      const jsonOutput = program.opts().json

      try {
        // Step 1: Check prerequisites
        console.log(chalk.bold('\nwdk-wallet MCP Setup for Claude Desktop\n'))

        // Check Node.js version
        const nodeVersion = process.version
        const major = parseInt(nodeVersion.slice(1))
        if (major < 20) {
          console.log(chalk.red(`  ✗ Node.js >= 20 required (found ${nodeVersion})`))
          console.log(chalk.dim(`    Install from https://nodejs.org/`))
          process.exit(1)
        }
        console.log(chalk.green(`  ✓ Node.js ${nodeVersion}`))

        // Step 2: Find Claude Desktop config
        const configPath = getClaudeDesktopConfigPath()
        if (!configPath) {
          console.log(chalk.red(`  ✗ Unsupported platform: ${platform()}`))
          console.log(chalk.dim('    Claude Desktop is available on macOS, Windows, and Linux'))
          process.exit(1)
        }

        const configDir = dirname(configPath)
        const configExists = existsSync(configPath)
        const dirExists = existsSync(configDir)

        if (!dirExists) {
          console.log(chalk.red('  ✗ Claude Desktop not found'))
          console.log(chalk.dim('    Download from https://claude.ai/download'))
          console.log(chalk.dim(`    Expected config at: ${configPath}`))
          process.exit(1)
        }
        console.log(chalk.green('  ✓ Claude Desktop found'))

        // Step 3: Read or create config
        let config: { mcpServers?: Record<string, unknown>; [key: string]: unknown }

        if (configExists) {
          const raw = readFileSync(configPath, 'utf8')
          try {
            config = JSON.parse(raw)
          } catch (e) {
            console.log(chalk.red('  ✗ Invalid JSON in Claude Desktop config'))
            console.log(chalk.dim(`    File: ${configPath}`))
            console.log(chalk.dim(`    Error: ${e instanceof Error ? e.message : String(e)}`))
            console.log(chalk.dim('    Please fix the JSON manually or delete the file and re-run this command'))
            process.exit(1)
          }
        } else {
          config = {}
        }

        if (!config.mcpServers) {
          config.mcpServers = {}
        }

        // Handle --remove
        if (options.remove) {
          if ('wdk-wallet' in config.mcpServers) {
            delete config.mcpServers['wdk-wallet']
            writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
            console.log(chalk.green('  ✓ Removed wdk-wallet from Claude Desktop'))
            console.log(chalk.dim('    Restart Claude Desktop to apply changes'))
          } else {
            console.log(chalk.yellow('  ⚠ wdk-wallet is not configured in Claude Desktop'))
          }
          return
        }

        // Step 4: Check if already configured
        if ('wdk-wallet' in config.mcpServers) {
          console.log(chalk.yellow('  ⚠ wdk-wallet is already configured'))
          console.log(chalk.dim(`    Config: ${configPath}`))
          console.log(chalk.dim('    Use --remove to reconfigure'))
          return
        }

        // Step 5: Find wdk-mcp binary
        const mcpConfig = getWdkMcpCommand()
        console.log(chalk.green(`  ✓ MCP server: ${mcpConfig.command}${mcpConfig.args ? ' ' + mcpConfig.args.join(' ') : ''}`))

        // Step 6: Verify MCP server starts
        if (!options.skipVerify) {
          process.stdout.write(chalk.dim('  ⋯ Verifying MCP server... '))
          const works = testMcpServer(mcpConfig)
          if (works) {
            console.log(chalk.green('OK'))
          } else {
            console.log(chalk.yellow('SKIP'))
            console.log(chalk.dim('    Could not verify MCP server (may still work with Claude Desktop)'))
          }
        }

        // Step 7: Write config
        const serverEntry: Record<string, unknown> = { command: mcpConfig.command }
        if (mcpConfig.args && mcpConfig.args.length > 0) {
          serverEntry.args = mcpConfig.args
        }
        config.mcpServers['wdk-wallet'] = serverEntry

        writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
        console.log(chalk.green('  ✓ Added wdk-wallet to Claude Desktop config'))

        // Step 8: Check wallet status
        const walletExists = existsSync(getKeyringPath())
        if (!walletExists) {
          console.log(chalk.yellow('  ⚠ No wallet found'))
          console.log(chalk.dim('    Run: wdk wallet create --words 24'))
        } else {
          console.log(chalk.green('  ✓ Wallet found'))
        }

        // Step 9: Print next steps
        console.log(chalk.bold('\nNext steps:'))
        if (!walletExists) {
          console.log(chalk.dim('  1. Create a wallet:     wdk wallet create --words 24'))
          console.log(chalk.dim('  2. Unlock the wallet:   wdk wallet unlock --ttl 0'))
          console.log(chalk.dim('  3. Restart Claude Desktop (Cmd+Q, then reopen)'))
        } else {
          console.log(chalk.dim('  1. Unlock the wallet:   wdk wallet unlock --ttl 0'))
          console.log(chalk.dim('  2. Restart Claude Desktop (Cmd+Q, then reopen)'))
        }
        console.log()
        console.log(chalk.dim(`Config: ${configPath}`))
        console.log()
      } catch (e) {
        handleError(e, verbose, jsonOutput)
      }
    })
}
