import type { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, platform } from 'node:os'
import { execSync } from 'node:child_process'
import chalk from 'chalk'
import { getKeyringPath } from '../config/constants.js'
import { handleError } from '../errors/index.js'

function getClaudeDesktopConfigPath(): string | null {
  const home = homedir()
  const os = platform()
  if (os === 'darwin') return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  if (os === 'win32') return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
  if (os === 'linux') return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'Claude', 'claude_desktop_config.json')
  return null
}

function getClaudeCodeConfigPath(): string {
  return join(homedir(), '.claude.json')
}

function getOpenClawConfigPath(): string {
  return join(homedir(), '.openclaw', 'openclaw.json')
}

function getWdkMcpCommand(): { command: string; args?: string[] } {
  try {
    const whichCmd = platform() === 'win32' ? 'where wdk-mcp 2>nul' : 'which wdk-mcp 2>/dev/null'
    const binPath = execSync(whichCmd, { encoding: 'utf8', timeout: 5000 }).trim()
    if (binPath) return { command: binPath }
  } catch { /* not found globally */ }

  const nodePath = process.execPath
  const scriptPath = join(dirname(new URL(import.meta.url).pathname), '..', '..', 'bin', 'wdk-mcp.mjs')
  if (existsSync(scriptPath)) return { command: nodePath, args: [scriptPath] }

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

interface SetupTarget {
  name: string
  configPath: string
  checkInstalled: () => boolean
  notInstalledMessage: string[]
  restartMessage: string
}

function readOrCreateConfig(configPath: string): { mcpServers?: Record<string, unknown>; [key: string]: unknown } {
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf8')
    try {
      return JSON.parse(raw)
    } catch (e) {
      console.log(chalk.red(`  ✗ Invalid JSON in config file`))
      console.log(chalk.dim(`    File: ${configPath}`))
      console.log(chalk.dim(`    Error: ${e instanceof Error ? e.message : String(e)}`))
      console.log(chalk.dim('    Please fix the JSON manually or delete the file and re-run this command'))
      process.exit(1)
    }
  }
  return {}
}

function runSetup(target: SetupTarget, options: { remove?: boolean; skipVerify?: boolean }): void {
  console.log(chalk.bold(`\nwdk-wallet MCP Setup for ${target.name}\n`))

  const nodeVersion = process.version
  const major = parseInt(nodeVersion.slice(1))
  if (major < 20) {
    console.log(chalk.red(`  ✗ Node.js >= 20 required (found ${nodeVersion})`))
    console.log(chalk.dim('    Install from https://nodejs.org/'))
    process.exit(1)
  }
  console.log(chalk.green(`  ✓ Node.js ${nodeVersion}`))

  if (!target.checkInstalled()) {
    console.log(chalk.red(`  ✗ ${target.name} not found`))
    for (const line of target.notInstalledMessage) {
      console.log(chalk.dim(`    ${line}`))
    }
    process.exit(1)
  }
  console.log(chalk.green(`  ✓ ${target.name} found`))

  const config = readOrCreateConfig(target.configPath)
  if (!config.mcpServers) config.mcpServers = {}

  if (options.remove) {
    if ('wdk-wallet' in config.mcpServers) {
      delete config.mcpServers['wdk-wallet']
      writeFileSync(target.configPath, JSON.stringify(config, null, 2) + '\n')
      console.log(chalk.green(`  ✓ Removed wdk-wallet from ${target.name}`))
      console.log(chalk.dim(`    ${target.restartMessage}`))
    } else {
      console.log(chalk.yellow(`  ⚠ wdk-wallet is not configured in ${target.name}`))
    }
    return
  }

  if ('wdk-wallet' in config.mcpServers) {
    console.log(chalk.yellow('  ⚠ wdk-wallet is already configured'))
    console.log(chalk.dim(`    Config: ${target.configPath}`))
    console.log(chalk.dim('    Use --remove to reconfigure'))
    return
  }

  const mcpConfig = getWdkMcpCommand()
  console.log(chalk.green(`  ✓ MCP server: ${mcpConfig.command}${mcpConfig.args ? ' ' + mcpConfig.args.join(' ') : ''}`))

  if (!options.skipVerify) {
    process.stdout.write(chalk.dim('  ⋯ Verifying MCP server... '))
    const works = testMcpServer(mcpConfig)
    if (works) {
      console.log(chalk.green('OK'))
    } else {
      console.log(chalk.yellow('SKIP'))
      console.log(chalk.dim('    Could not verify MCP server (may still work)'))
    }
  }

  const serverEntry: Record<string, unknown> = { command: mcpConfig.command }
  if (mcpConfig.args && mcpConfig.args.length > 0) {
    serverEntry.args = mcpConfig.args
  }
  config.mcpServers['wdk-wallet'] = serverEntry
  writeFileSync(target.configPath, JSON.stringify(config, null, 2) + '\n')
  console.log(chalk.green(`  ✓ Added wdk-wallet to ${target.name} config`))

  const walletExists = existsSync(getKeyringPath())
  if (!walletExists) {
    console.log(chalk.yellow('  ⚠ No wallet found'))
    console.log(chalk.dim('    Run: wdk wallet create --words 24'))
  } else {
    console.log(chalk.green('  ✓ Wallet found'))
  }

  console.log(chalk.bold('\nNext steps:'))
  const steps: string[] = []
  if (!walletExists) steps.push('Create a wallet:     wdk wallet create --words 24')
  steps.push('Unlock the wallet:   wdk wallet unlock --ttl 0')
  steps.push(target.restartMessage)
  steps.forEach((s, i) => console.log(chalk.dim(`  ${i + 1}. ${s}`)))
  console.log()
  console.log(chalk.dim(`Config: ${target.configPath}`))
  console.log()
}

export function registerSetupCommand(program: Command): void {
  const setup = program
    .command('setup')
    .description('Set up wdk-wallet integrations')

  const setupOptions = (cmd: Command) =>
    cmd
      .option('--remove', 'Remove wdk-wallet configuration')
      .option('--skip-verify', 'Skip MCP server verification')

  setupOptions(
    setup
      .command('claude-desktop')
      .description('Configure wdk-wallet MCP server for Claude Desktop app'),
  ).action(async (options: { remove?: boolean; skipVerify?: boolean }) => {
    try {
      const configPath = getClaudeDesktopConfigPath()
      if (!configPath) {
        console.log(chalk.red(`\n  ✗ Unsupported platform: ${platform()}`))
        console.log(chalk.dim('    Claude Desktop is available on macOS, Windows, and Linux'))
        process.exit(1)
      }

      runSetup(
        {
          name: 'Claude Desktop',
          configPath,
          checkInstalled: () => existsSync(dirname(configPath)),
          notInstalledMessage: ['Download from https://claude.ai/download'],
          restartMessage: 'Restart Claude Desktop (Cmd+Q, then reopen)',
        },
        options,
      )
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })

  setupOptions(
    setup
      .command('claude-code')
      .description('Configure wdk-wallet MCP server for Claude Code CLI (global)'),
  ).action(async (options: { remove?: boolean; skipVerify?: boolean }) => {
    try {
      const configPath = getClaudeCodeConfigPath()

      runSetup(
        {
          name: 'Claude Code',
          configPath,
          checkInstalled: () => {
            try {
              execSync('which claude 2>/dev/null || where claude 2>nul', { encoding: 'utf8', timeout: 5000 })
              return true
            } catch {
              return existsSync(join(homedir(), '.claude'))
            }
          },
          notInstalledMessage: [
            'Install Claude Code: npm install -g @anthropic-ai/claude-code',
            'Or visit: https://claude.ai/code',
          ],
          restartMessage: 'Start a new Claude Code session to use wdk-wallet tools',
        },
        options,
      )
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })

  setupOptions(
    setup
      .command('openclaw')
      .description('Configure wdk-wallet MCP server for OpenClaw'),
  ).action(async (options: { remove?: boolean; skipVerify?: boolean }) => {
    try {
      const configPath = getOpenClawConfigPath()

      runSetup(
        {
          name: 'OpenClaw',
          configPath,
          checkInstalled: () => existsSync(dirname(configPath)),
          notInstalledMessage: [
            'Install OpenClaw: https://github.com/openclaw/openclaw',
            `Expected config at: ${configPath}`,
          ],
          restartMessage: 'Restart OpenClaw gateway: openclaw gateway restart',
        },
        options,
      )
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })
}
