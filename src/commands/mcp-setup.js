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

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, platform } from 'node:os'
import { execSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'

/**
 * @typedef {Object} McpCliSetup
 * @property {function({command: string, args: string[]}): boolean} add - Registers the MCP server via CLI.
 * @property {function(): boolean} remove - Unregisters the MCP server via CLI.
 * @property {function(): boolean} isConfigured - Returns true if the MCP server is already registered.
 */

/**
 * @typedef {Object} SetupTarget
 * @property {string} name - Human-readable name of the AI tool (e.g. "Claude Desktop").
 * @property {string} configPath - Absolute path to the AI tool config file.
 * @property {function(): boolean} checkInstalled - Returns true if the AI tool is installed.
 * @property {string[]} notInstalledMessage - Lines to display when the tool is not installed.
 * @property {string} restartMessage - Message shown after setup instructing the user to restart.
 * @property {string[]} [serversPath] - Path within the config JSON to the mcpServers object.
 * @property {McpCliSetup} [cliSetup] - CLI-based setup callbacks (used instead of direct file write).
 */

/**
 * Returns the Windows %LOCALAPPDATA% directory path.
 *
 * @returns {string} The local app data directory path.
 */
function getWindowsLocalAppData() {
  return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
}

// Claude Desktop ships on Windows as either a Squirrel installer or an
// MSIX/Microsoft Store package. MSIX apps are sandboxed, so their %APPDATA%
// writes land at %LOCALAPPDATA%\Packages\Claude_<publisherHash>\LocalCache\Roaming\...
// We match the folder by prefix since the publisher hash varies per signing identity.
/**
 * Finds the Claude MSIX package directory on Windows, or returns null on other platforms.
 *
 * @returns {string | null} The package directory path, or null if not found.
 */
function findClaudeMsixPackageDir() {
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

/**
 * Returns true if Claude Desktop appears to be installed on the current OS.
 *
 * @returns {boolean} Whether Claude Desktop is installed.
 */
function isClaudeDesktopInstalled() {
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

/**
 * Returns the platform-specific Claude Desktop config file path, or null on unsupported platforms.
 *
 * @returns {string | null} The config file path.
 */
function getClaudeDesktopConfigPath() {
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

/**
 * Returns the Claude Code MCP config file path (~/.claude.json).
 *
 * @returns {string} The config file path.
 */
function getClaudeCodeConfigPath() {
  return join(homedir(), '.claude.json')
}

/**
 * Returns the OpenClaw config file path (~/.openclaw/openclaw.json).
 *
 * @returns {string} The config file path.
 */
function getOpenClawConfigPath() {
  return join(homedir(), '.openclaw', 'openclaw.json')
}

/**
 * Resolves the absolute path to bin/wdk-mcp.mjs by walking up from the current module.
 *
 * @returns {string} The absolute path to wdk-mcp.mjs.
 */
function getMcpScriptPath() {
  const thisFile = fileURLToPath(import.meta.url)
  let dir = dirname(thisFile)
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'bin', 'wdk-mcp.mjs')
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }
  throw new Error('Could not find bin/wdk-mcp.mjs relative to the current module')
}

/**
 * Returns the command and args needed to launch the WDK MCP server.
 *
 * @returns {{command: string, args: string[]}} The command descriptor.
 */
function getWdkMcpCommand() {
  return { command: process.execPath, args: [getMcpScriptPath()] }
}

/**
 * Sends a JSON-RPC initialize request to the MCP server and returns true if it responds correctly.
 *
 * @param {{command: string, args?: string[]}} mcpConfig - The MCP server command descriptor.
 * @returns {boolean} Whether the server responded with the expected wdk-wallet identity.
 */
function testMcpServer(mcpConfig) {
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

/**
 * Reads and parses the JSON config file at configPath, or returns an empty object if it does not exist.
 *
 * @param {string} configPath - Absolute path to the JSON config file.
 * @returns {Record<string, unknown>} The parsed config object.
 */
function readOrCreateConfig(configPath) {
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf8')
    try {
      return JSON.parse(raw)
    } catch (e) {
      throw new WdkCliError(
        `Invalid JSON in config file: ${configPath}`,
        ErrorCode.INVALID_CONFIG,
        `Original error: ${e instanceof Error ? e.message : String(e)}\n` +
          'Please fix the JSON manually or delete the file and re-run this command',
      )
    }
  }
  return {}
}

/**
 * Traverses (and creates as needed) a nested path within a config object, returning the leaf object.
 *
 * @param {Record<string, unknown>} config - The root config object.
 * @param {string[]} path - Array of keys forming the path to traverse.
 * @returns {Record<string, unknown>} The object at the end of the path.
 */
function getServersObject(config, path) {
  let obj = config
  for (const key of path) {
    if (!obj[key] || typeof obj[key] !== 'object') obj[key] = {}
    obj = /** @type {Record<string, unknown>} */ (obj[key])
  }
  return obj
}

/**
 * Returns lines of JSON to paste manually into a config file for the wdk-wallet MCP server entry.
 *
 * @returns {string[]} The JSON lines.
 */
function buildManualMcpJson() {
  const mcpConfig = getWdkMcpCommand()
  return [
    '  "wdk-wallet": {',
    `    "command": "${mcpConfig.command}",`,
    `    "args": ["${mcpConfig.args[0]}"]`,
    '  }',
  ]
}

/**
 * Runs the setup flow for the given AI tool target, writing the MCP server entry to its config.
 *
 * @param {SetupTarget} target - The AI tool setup target descriptor.
 * @returns {void}
 */
function runSetup(target) {
  console.log()

  if (!target.checkInstalled()) {
    throw new WdkCliError(
      `${target.name} not found`,
      ErrorCode.MISSING_CONFIG,
      target.notInstalledMessage.join('\n'),
    )
  }

  if (target.cliSetup) {
    if (target.cliSetup.isConfigured()) {
      console.log(chalk.green(`  ✓ wdk-wallet is already configured in ${target.name}`))
      console.log(chalk.dim(`    To reinstall: wdk mcp remove --ai-tool <name>, then re-run setup`))
      console.log()
      return
    }

    const mcpConfig = getWdkMcpCommand()

    process.stdout.write(chalk.dim('  Verifying MCP server... '))
    const works = testMcpServer(mcpConfig)
    if (works) {
      console.log(chalk.green('OK'))
    } else {
      console.log(chalk.yellow('SKIP'))
      console.log(chalk.dim('    Could not verify MCP server (may still work)'))
    }

    const ok = target.cliSetup.add(mcpConfig)
    if (ok) {
      console.log(chalk.green(`  ✓ Added wdk-wallet to ${target.name}`))
    } else {
      console.log(chalk.red(`  ✗ Failed to add wdk-wallet to ${target.name}`))
    }
    console.log()
    console.log(chalk.dim(`  ${target.restartMessage}`))
    console.log()
    return
  }

  const config = readOrCreateConfig(target.configPath)
  const serversPath = target.serversPath ?? ['mcpServers']
  const servers = getServersObject(config, serversPath)

  if ('wdk-wallet' in servers) {
    console.log(chalk.green(`  ✓ wdk-wallet is already configured in ${target.name}`))
    console.log(chalk.dim(`    Config: ${target.configPath}`))
    console.log(chalk.dim(`    To reinstall: wdk mcp remove --ai-tool <name>, then re-run setup`))
    console.log()
    return
  }

  const mcpConfig = getWdkMcpCommand()

  process.stdout.write(chalk.dim('  Verifying MCP server... '))
  const works = testMcpServer(mcpConfig)
  if (works) {
    console.log(chalk.green('OK'))
  } else {
    console.log(chalk.yellow('SKIP'))
    console.log(chalk.dim('    Could not verify MCP server (may still work)'))
  }

  const serverEntry = { command: mcpConfig.command }
  if (mcpConfig.args && mcpConfig.args.length > 0) {
    serverEntry.args = mcpConfig.args
  }
  servers['wdk-wallet'] = serverEntry
  mkdirSync(dirname(target.configPath), { recursive: true })
  writeFileSync(target.configPath, JSON.stringify(config, null, 2) + '\n')
  console.log(chalk.green(`  ✓ Added wdk-wallet to ${target.name}`))
  console.log(chalk.dim(`    Config: ${target.configPath}`))

  console.log()
  console.log(chalk.dim(`  ${target.restartMessage}`))
  console.log()
}

/**
 * Removes the wdk-wallet MCP server entry from the given AI tool target config.
 *
 * @param {SetupTarget} target - The AI tool setup target descriptor.
 * @returns {void}
 */
function runRemove(target) {
  console.log()

  if (target.cliSetup) {
    if (!target.cliSetup.isConfigured()) {
      console.log(chalk.dim(`  wdk-wallet is not configured in ${target.name}`))
      console.log()
      return
    }
    const ok = target.cliSetup.remove()
    if (ok) {
      console.log(chalk.green(`  ✓ Removed wdk-wallet from ${target.name}`))
      console.log(chalk.dim(`    ${target.restartMessage}`))
    } else {
      console.log(chalk.red(`  ✗ Failed to remove wdk-wallet from ${target.name}`))
    }
    console.log()
    return
  }

  if (!existsSync(target.configPath)) {
    console.log(chalk.dim(`  wdk-wallet is not configured in ${target.name}`))
    console.log()
    return
  }

  const config = readOrCreateConfig(target.configPath)
  const serversPath = target.serversPath ?? ['mcpServers']
  const servers = getServersObject(config, serversPath)

  if ('wdk-wallet' in servers) {
    delete servers['wdk-wallet']
    writeFileSync(target.configPath, JSON.stringify(config, null, 2) + '\n')
    console.log(chalk.green(`  ✓ Removed wdk-wallet from ${target.name}`))
    console.log(chalk.dim(`    ${target.restartMessage}`))
  } else {
    console.log(chalk.dim(`  wdk-wallet is not configured in ${target.name}`))
  }
  console.log()
}

/**
 * Returns true if wdk-wallet is already registered in the given AI tool target config.
 *
 * @param {SetupTarget} target - The AI tool setup target descriptor.
 * @returns {boolean} Whether wdk-wallet is configured.
 */
function isConfigured(target) {
  if (target.cliSetup) return target.cliSetup.isConfigured()
  if (!existsSync(target.configPath)) return false
  try {
    const raw = readFileSync(target.configPath, 'utf8')
    const config = JSON.parse(raw)
    const path = target.serversPath ?? ['mcpServers']
    let servers = config
    for (const key of path) {
      servers = servers?.[key]
    }
    return !!servers && 'wdk-wallet' in servers
  } catch {
    return false
  }
}

/**
 * Prints the wdk-wallet configuration status for all supported AI tools to stdout.
 *
 * @returns {void}
 */
function runList() {
  console.log()
  const targets = [
    { name: 'Claude Desktop', target: getClaudeDesktopConfigPath() ? getSetupTarget('claude-desktop') : null },
    { name: 'Claude Code', target: getSetupTarget('claude-code') },
    { name: 'OpenClaw', target: getSetupTarget('openclaw') },
  ]

  for (const { name, target } of targets) {
    if (!target) {
      console.log(`  ${name.padEnd(20)} ${chalk.dim('n/a')}`)
      continue
    }
    try {
      if (isConfigured(target)) {
        console.log(`  ${name.padEnd(20)} ${chalk.green('✓ configured')}`)
      } else {
        console.log(`  ${name.padEnd(20)} ${chalk.dim('not configured')}`)
      }
    } catch {
      console.log(`  ${name.padEnd(20)} ${chalk.yellow('error')}`)
    }
  }
  console.log()
}

const SUPPORTED_AI_TOOLS = Object.freeze(['claude-desktop', 'claude-code', 'openclaw'])

/**
 * Returns the SetupTarget descriptor for the given AI tool identifier.
 *
 * @param {string} aiTool - The AI tool identifier (e.g. "claude-desktop", "claude-code", "openclaw").
 * @returns {SetupTarget} The setup target descriptor.
 */
function getSetupTarget(aiTool) {
  switch (aiTool) {
    case 'claude-desktop': {
      const configPath = getClaudeDesktopConfigPath()
      if (!configPath) {
        throw new WdkCliError(
          `Unsupported platform: ${platform()}`,
          ErrorCode.MISSING_CONFIG,
          'Claude Desktop is available on macOS, Windows, and Linux',
        )
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
          'Install (if not installed): https://claude.ai/download',
          '',
          'Or configure manually in:',
          `  ${configPath}`,
          '',
          'Add to "mcpServers":',
          ...buildManualMcpJson(),
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
          'Install (if not installed): https://docs.anthropic.com/en/docs/claude-code/overview',
          '',
          'Or add manually:',
          `  claude mcp add -s user wdk-wallet -- ${process.execPath} ${getMcpScriptPath()}`,
        ],
        restartMessage: 'Start a new Claude Code session to use wdk-wallet tools',
        cliSetup: {
          add: (mcpConfig) => {
            try {
              const result = spawnSync('claude', ['mcp', 'add', '-s', 'user', 'wdk-wallet', '--', mcpConfig.command, ...mcpConfig.args], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] })
              return result.status === 0
            } catch {
              return false
            }
          },
          remove: () => {
            try {
              const result = spawnSync('claude', ['mcp', 'remove', '-s', 'user', 'wdk-wallet'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] })
              return result.status === 0
            } catch {
              return false
            }
          },
          isConfigured: () => {
            try {
              const raw = readFileSync(configPath, 'utf8')
              const config = JSON.parse(raw)
              const servers = config.mcpServers
              return !!servers && 'wdk-wallet' in servers
            } catch {
              return false
            }
          },
        },
      }
    }
    case 'openclaw': {
      const configPath = getOpenClawConfigPath()
      return {
        name: 'OpenClaw',
        configPath,
        serversPath: ['mcp', 'servers'],
        checkInstalled: () => {
          const result = spawnSync('openclaw', ['--version'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] })
          if (result.status === 0) return true
          return existsSync(dirname(configPath))
        },
        notInstalledMessage: [
          'Install (if not installed): https://docs.openclaw.ai/install',
          '',
          'Or add manually:',
          `  openclaw mcp set wdk-wallet '${JSON.stringify({ command: process.execPath, args: [getMcpScriptPath()] })}'`,
        ],
        restartMessage: 'Restart OpenClaw gateway: openclaw gateway restart',
        cliSetup: {
          add: (mcpConfig) => {
            try {
              const serverJson = JSON.stringify({ command: mcpConfig.command, args: mcpConfig.args })
              const result = spawnSync('openclaw', ['mcp', 'set', 'wdk-wallet', serverJson], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] })
              return result.status === 0
            } catch {
              return false
            }
          },
          remove: () => {
            try {
              const result = spawnSync('openclaw', ['mcp', 'unset', 'wdk-wallet'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] })
              return result.status === 0
            } catch {
              return false
            }
          },
          isConfigured: () => {
            try {
              const result = spawnSync('openclaw', ['mcp', 'list'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] })
              return (result.stdout ?? '').includes('wdk-wallet')
            } catch {
              return false
            }
          },
        },
      }
    }
    default:
      throw new WdkCliError(
        `Unknown AI tool '${aiTool}'. Supported: ${SUPPORTED_AI_TOOLS.join(', ')}`,
        ErrorCode.INVALID_ARGUMENT,
      )
  }
}

/**
 * Verifies that wdk-wallet is configured for the given AI tool and that the MCP server responds.
 *
 * @param {string} aiTool - The AI tool identifier.
 * @returns {void}
 */
function runVerifySetup(aiTool) {
  const target = getSetupTarget(aiTool)
  console.log()

  const configOk = isConfigured(target)
  if (configOk) {
    console.log(chalk.green(`  ✓ wdk-wallet found in ${target.name}`))
  } else {
    console.log(chalk.red(`  ✗ wdk-wallet not found in ${target.name}`))
    console.log(chalk.dim(`    Run: wdk mcp setup --ai-tool ${aiTool}`))
  }

  if (configOk) {
    process.stdout.write(chalk.dim('  Testing MCP server... '))
    const mcpConfig = getWdkMcpCommand()
    const works = testMcpServer(mcpConfig)
    if (works) {
      console.log(chalk.green('OK'))
    } else {
      console.log(chalk.red('FAILED'))
      console.log(chalk.dim('    MCP server did not respond correctly'))
      console.log(chalk.dim(`    Command: ${mcpConfig.command} ${mcpConfig.args.join(' ')}`))
    }
  }

  console.log()
}

/**
 * Registers the `mcp` subcommand tree (setup, remove, verify-setup, list) on the root program.
 *
 * @param {import('commander').Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerMcpCommand(program) {
  const mcp = program
    .command('mcp')
    .description('Manage WDK MCP server')

  configureHelp(mcp, {})

  const setup = mcp
    .command('setup')
    .description('Configure WDK MCP server for an AI tool')
    .requiredOption('--ai-tool <name>', `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`)

  configureHelp(setup, {
    params: [
      { flags: '--ai-tool <name>', description: `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`, required: true },
    ],
  })

  setup.action((options) => {
    try {
      const target = getSetupTarget(options.aiTool)
      runSetup(target)
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })

  const remove = mcp
    .command('remove')
    .description('Remove WDK MCP server from an AI tool')
    .requiredOption('--ai-tool <name>', `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`)

  configureHelp(remove, {
    params: [
      { flags: '--ai-tool <name>', description: `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`, required: true },
    ],
  })

  remove.action((options) => {
    try {
      const target = getSetupTarget(options.aiTool)
      runRemove(target)
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })

  const verifySetup = mcp
    .command('verify-setup')
    .description('Verify WDK MCP server is correctly configured for an AI tool')
    .requiredOption('--ai-tool <name>', `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`)

  configureHelp(verifySetup, {
    params: [
      { flags: '--ai-tool <name>', description: `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`, required: true },
    ],
  })

  verifySetup.action((options) => {
    try {
      runVerifySetup(options.aiTool)
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })

  const list = mcp
    .command('list')
    .description('Show WDK MCP server status across all AI tools')

  configureHelp(list, {})

  list.action(() => {
    try {
      runList()
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })
}
