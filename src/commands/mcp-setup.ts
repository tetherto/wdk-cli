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

import type { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, platform } from 'node:os'
import { execSync, spawnSync } from 'node:child_process'
import chalk from 'chalk'
import { handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'

function getWindowsLocalAppData(): string {
  return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
}

// Claude Desktop ships on Windows as either a Squirrel installer or an
// MSIX/Microsoft Store package. MSIX apps are sandboxed, so their %APPDATA%
// writes land at %LOCALAPPDATA%\Packages\Claude_<publisherHash>\LocalCache\Roaming\...
// We match the folder by prefix since the publisher hash varies per signing identity.
function findClaudeMsixPackageDir(): string | null {
  if (platform() !== 'win32') return null
  const packagesDir = join(getWindowsLocalAppData(), 'Packages')
  if (!existsSync(packagesDir)) return null
  try {
    const match = readdirSync(packagesDir).find(name => name.startsWith('Claude_'))
    return match ? join(packagesDir, match) : null
  } catch {
    return null
  }
}

function isClaudeDesktopInstalled(): boolean {
  const os = platform()
  const home = homedir()
  if (os === 'darwin') {
    return existsSync('/Applications/Claude.app') || existsSync(join(home, 'Applications', 'Claude.app'))
  }
  if (os === 'win32') {
    if (findClaudeMsixPackageDir()) return true
    const localAppData = getWindowsLocalAppData()
    const candidates = [
      join(localAppData, 'Programs', 'claude-desktop', 'Claude.exe'),
      join(localAppData, 'AnthropicClaude', 'Claude.exe'),
      join(localAppData, 'Claude', 'Claude.exe'),
    ]
    return candidates.some(p => existsSync(p))
  }
  if (os === 'linux') {
    try {
      execSync('which claude-desktop 2>/dev/null', { encoding: 'utf8', timeout: 3000 })
      return true
    } catch { /* */ }
    return existsSync('/opt/Claude/claude-desktop') || existsSync(join(home, '.local', 'bin', 'claude-desktop'))
  }
  return false
}

function getClaudeDesktopConfigPath(): string | null {
  const home = homedir()
  const os = platform()
  if (os === 'darwin') return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  if (os === 'win32') {
    const msixPackageDir = findClaudeMsixPackageDir()
    if (msixPackageDir) return join(msixPackageDir, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json')
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
  }
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
  // On Windows, invoke the globally-installed `wdk-mcp` shim via cmd.
  if (platform() === 'win32') {
    return { command: 'cmd', args: ['/c', 'wdk-mcp'] }
  }
  return { command: 'npx', args: ['-y', '-p', 'wdk-cli', 'wdk-mcp'] }
}

function testMcpServer(mcpConfig: { command: string; args?: string[] }): boolean {
  try {
    const initRequest = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"setup-test","version":"1.0"}}}\n'
    const result = spawnSync(mcpConfig.command, mcpConfig.args ?? [], {
      input: initRequest,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return (result.stdout ?? '').includes('"wdk-wallet"')
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
  console.log()

  if (!target.checkInstalled()) {
    console.log(chalk.red(`  ✗ ${target.name} not found`))
    for (const line of target.notInstalledMessage) {
      console.log(chalk.dim(`    ${line}`))
    }
    process.exit(1)
  }

  const config = readOrCreateConfig(target.configPath)
  if (!config.mcpServers) config.mcpServers = {}

  if (options.remove) {
    if ('wdk-wallet' in config.mcpServers) {
      delete config.mcpServers['wdk-wallet']
      writeFileSync(target.configPath, JSON.stringify(config, null, 2) + '\n')
      console.log(chalk.green(`  ✓ Removed wdk-wallet from ${target.name}`))
      console.log(chalk.dim(`    ${target.restartMessage}`))
    } else {
      console.log(chalk.dim(`  wdk-wallet is not configured in ${target.name}`))
    }
    console.log()
    return
  }

  if ('wdk-wallet' in config.mcpServers) {
    console.log(chalk.green(`  ✓ wdk-wallet is already configured in ${target.name}`))
    console.log(chalk.dim(`    Config: ${target.configPath}`))
    console.log(chalk.dim(`    Use --remove to uninstall, or --remove then re-run to reinstall`))
    console.log()
    return
  }

  const mcpConfig = getWdkMcpCommand()

  if (!options.skipVerify) {
    process.stdout.write(chalk.dim('  Verifying MCP server... '))
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
  console.log(chalk.green(`  ✓ Added wdk-wallet to ${target.name}`))
  console.log(chalk.dim(`    Config: ${target.configPath}`))

  console.log()
  console.log(chalk.dim(`  ${target.restartMessage}`))
  console.log()
}

const SUPPORTED_AI_TOOLS = ['claude-desktop', 'claude-code', 'openclaw'] as const

function getSetupTarget(aiTool: string): SetupTarget {
  switch (aiTool) {
    case 'claude-desktop': {
      const configPath = getClaudeDesktopConfigPath()
      if (!configPath) {
        console.log(chalk.red(`\n  ✗ Unsupported platform: ${platform()}`))
        console.log(chalk.dim('    Claude Desktop is available on macOS, Windows, and Linux'))
        process.exit(1)
      }
      return {
        name: 'Claude Desktop',
        configPath,
        checkInstalled: () => {
          if (existsSync(dirname(configPath))) return true
          if (isClaudeDesktopInstalled()) {
            mkdirSync(dirname(configPath), { recursive: true })
            return true
          }
          return false
        },
        notInstalledMessage: [
          'If not installed, download from https://claude.ai/download',
          'If already installed, configure MCP directly in Claude Desktop:',
          'Settings → Developer → Edit Config, then add to mcpServers:',
          '',
          ...(platform() === 'win32' ? [
            '  "wdk-wallet": {',
            '    "command": "cmd",',
            '    "args": ["/c", "wdk-mcp"]',
            '  }',
          ] : [
            '  "wdk-wallet": {',
            '    "command": "npx",',
            '    "args": ["-y", "-p", "wdk-cli", "wdk-mcp"]',
            '  }',
          ]),
        ],
        restartMessage: `Restart Claude Desktop${platform() === 'darwin' ? ' (Cmd+Q, then reopen)' : ''}`,
      }
    }
    case 'claude-code': {
      const configPath = getClaudeCodeConfigPath()
      return {
        name: 'Claude Code',
        configPath,
        checkInstalled: () => {
          try {
            execSync('which claude 2>/dev/null || where claude 2>nul', { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] })
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
      }
    }
    case 'openclaw': {
      const configPath = getOpenClawConfigPath()
      return {
        name: 'OpenClaw',
        configPath,
        checkInstalled: () => existsSync(dirname(configPath)),
        notInstalledMessage: [
          'Install OpenClaw: https://github.com/openclaw/openclaw',
          `Expected config at: ${configPath}`,
        ],
        restartMessage: 'Restart OpenClaw gateway: openclaw gateway restart',
      }
    }
    default:
      console.error(chalk.red(`Error: Unknown AI tool '${aiTool}'. Supported: ${SUPPORTED_AI_TOOLS.join(', ')}`))
      process.exit(1)
  }
}

export function registerMcpCommand(program: Command): void {
  const mcp = program
    .command('mcp')
    .description('Manage WDK MCP server')

  configureHelp(mcp, {})

  // --- mcp setup ---
  const setup = mcp
    .command('setup')
    .description('Configure WDK MCP server for an AI tool')
    .requiredOption('--ai-tool <name>', `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`)
    .option('--remove', 'Remove wdk-wallet configuration')
    .option('--skip-verify', 'Skip MCP server verification')

  configureHelp(setup, {
    params: [
      { flags: '--ai-tool <name>', description: `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`, required: true },
    ],
    options: [
      { flags: '--remove', description: 'Remove wdk-wallet configuration' },
      { flags: '--skip-verify', description: 'Skip MCP server verification' },
    ],
  })

  setup.action((options: { aiTool: string; remove?: boolean; skipVerify?: boolean }) => {
    try {
      const target = getSetupTarget(options.aiTool)
      runSetup(target, options)
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })

  const status = mcp
    .command('status')
    .description('Show which AI tools have WDK MCP server configured')

  configureHelp(status, {})

  status.action(() => {
    try {
      const targets: { name: string; configPath: string | null }[] = [
        { name: 'Claude Desktop', configPath: getClaudeDesktopConfigPath() },
        { name: 'Claude Code', configPath: getClaudeCodeConfigPath() },
        { name: 'OpenClaw', configPath: getOpenClawConfigPath() },
      ]

      console.log()
      for (const target of targets) {
        if (!target.configPath || !existsSync(target.configPath)) {
          console.log(`  ${target.name.padEnd(20)} ${chalk.dim('not configured')}`)
          continue
        }
        try {
          const raw = readFileSync(target.configPath, 'utf8')
          const config = JSON.parse(raw) as { mcpServers?: Record<string, unknown> }
          if (config.mcpServers && 'wdk-wallet' in config.mcpServers) {
            console.log(`  ${target.name.padEnd(20)} ${chalk.green('✓ configured')}`)
          } else {
            console.log(`  ${target.name.padEnd(20)} ${chalk.dim('not configured')}`)
          }
        } catch {
          console.log(`  ${target.name.padEnd(20)} ${chalk.yellow('invalid config')}`)
        }
      }
      console.log()
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })
}
