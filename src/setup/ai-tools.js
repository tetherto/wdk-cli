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
import { WdkCliError, ErrorCode } from '../errors/index.js'

/**
 * @typedef {Object} McpCommand
 * @property {string} command - Absolute path to the executable that launches the MCP server.
 * @property {string[]} args - Arguments passed to the executable.
 */

/**
 * @typedef {Object} McpCliSetup
 * @property {function(McpCommand): boolean} add - Registers the MCP server via CLI.
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
 * @typedef {Object} SetupMcpResult
 * @property {'already_configured' | 'added' | 'add_failed'} status - Outcome of the setup attempt.
 * @property {string} targetName - Human-readable AI tool name.
 * @property {string | null} configPath - Config file path (null when configured via CLI tool).
 * @property {boolean | null} mcpVerified - true=OK, false=failed verification, null=not tested.
 * @property {string} restartMessage - Message instructing the user to restart the AI tool.
 */

/**
 * @typedef {Object} RemoveMcpResult
 * @property {'removed' | 'not_configured' | 'remove_failed'} status - Outcome of the remove attempt.
 * @property {string} targetName - Human-readable AI tool name.
 * @property {string} restartMessage - Message instructing the user to restart the AI tool.
 */

/**
 * @typedef {Object} VerifyMcpResult
 * @property {string} targetName - Human-readable AI tool name.
 * @property {boolean} configured - Whether wdk-wallet is registered in the AI tool config.
 * @property {boolean | null} mcpWorks - MCP server response check (null when not configured).
 * @property {string} mcpCommand - Command path used to launch the MCP server.
 * @property {string[]} mcpArgs - Arguments used to launch the MCP server.
 */

/**
 * @typedef {Object} ListMcpEntry
 * @property {string} name - Human-readable AI tool name.
 * @property {'configured' | 'not_configured' | 'n/a' | 'error'} status - Configuration status.
 */

export const SUPPORTED_AI_TOOLS = Object.freeze(['claude-desktop', 'claude-code', 'openclaw'])

/**
 * Returns the Windows %LOCALAPPDATA% directory path.
 *
 * @returns {string} The local app data directory path.
 */
function getWindowsLocalAppData () {
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
function findClaudeMsixPackageDir () {
  if (platform() !== 'win32') return null
  const packagesDir = join(getWindowsLocalAppData(), 'Packages')
  if (!existsSync(packagesDir)) return null
  try {
    const match = readdirSync(packagesDir).find((name) => name.startsWith('Claude_'))
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
function isClaudeDesktopInstalled () {
  const os = platform()
  const home = homedir()
  if (os === 'darwin') {
    return (
      existsSync('/Applications/Claude.app') || existsSync(join(home, 'Applications', 'Claude.app'))
    )
  }
  if (os === 'win32') {
    if (findClaudeMsixPackageDir()) return true
    const localAppData = getWindowsLocalAppData()
    const candidates = [
      join(localAppData, 'Programs', 'claude-desktop', 'Claude.exe'),
      join(localAppData, 'AnthropicClaude', 'Claude.exe'),
      join(localAppData, 'Claude', 'Claude.exe')
    ]
    return candidates.some((p) => existsSync(p))
  }
  if (os === 'linux') {
    try {
      execSync('which claude-desktop 2>/dev/null', { encoding: 'utf8', timeout: 3000 })
      return true
    } catch {
      /* */
    }
    return (
      existsSync('/opt/Claude/claude-desktop') ||
      existsSync(join(home, '.local', 'bin', 'claude-desktop'))
    )
  }
  return false
}

/**
 * Returns the platform-specific Claude Desktop config file path, or null on unsupported platforms.
 *
 * @returns {string | null} The config file path.
 */
function getClaudeDesktopConfigPath () {
  const home = homedir()
  const os = platform()
  if (os === 'darwin') { return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json') }
  if (os === 'win32') {
    const msixPackageDir = findClaudeMsixPackageDir()
    if (msixPackageDir) { return join(msixPackageDir, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json') }
    return join(
      process.env.APPDATA || join(home, 'AppData', 'Roaming'),
      'Claude',
      'claude_desktop_config.json'
    )
  }
  if (os === 'linux') {
    return join(
      process.env.XDG_CONFIG_HOME || join(home, '.config'),
      'Claude',
      'claude_desktop_config.json'
    )
  }
  return null
}

/**
 * Returns the Claude Code MCP config file path (~/.claude.json).
 *
 * @returns {string} The config file path.
 */
function getClaudeCodeConfigPath () {
  return join(homedir(), '.claude.json')
}

/**
 * Returns the OpenClaw config file path (~/.openclaw/openclaw.json).
 *
 * @returns {string} The config file path.
 */
function getOpenClawConfigPath () {
  return join(homedir(), '.openclaw', 'openclaw.json')
}

/**
 * Resolves the absolute path to bin/wdk-mcp.mjs by walking up from the current module.
 *
 * @returns {string} The absolute path to wdk-mcp.mjs.
 */
function getMcpScriptPath () {
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
 * @returns {McpCommand} The command descriptor.
 */
function getWdkMcpCommand () {
  return { command: process.execPath, args: [getMcpScriptPath()] }
}

/**
 * Sends a JSON-RPC initialize request to the MCP server and returns true if it responds correctly.
 *
 * @param {McpCommand} mcpConfig - The MCP server command descriptor.
 * @returns {boolean} Whether the server responded with the expected wdk-wallet identity.
 */
function testMcpServer (mcpConfig) {
  try {
    const initRequest =
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"setup-test","version":"1.0"}}}\n'
    const result = spawnSync(mcpConfig.command, mcpConfig.args ?? [], {
      input: initRequest,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe']
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
function readOrCreateConfig (configPath) {
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf8')
    try {
      return JSON.parse(raw)
    } catch {
      throw new WdkCliError(`Invalid JSON in config file: ${configPath}`, ErrorCode.INVALID_CONFIG)
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
function getServersObject (config, path) {
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
function buildManualMcpJson () {
  const mcpConfig = getWdkMcpCommand()
  return [
    '  "wdk-wallet": {',
    `    "command": ${JSON.stringify(mcpConfig.command)},`,
    `    "args": ${JSON.stringify(mcpConfig.args)}`,
    '  }'
  ]
}

/**
 * Returns the SetupTarget descriptor for the given AI tool identifier.
 *
 * @param {string} aiTool - The AI tool identifier (e.g. "claude-desktop", "claude-code", "openclaw").
 * @returns {SetupTarget} The setup target descriptor.
 */
function getSetupTarget (aiTool) {
  switch (aiTool) {
    case 'claude-desktop': {
      const configPath = getClaudeDesktopConfigPath()
      if (!configPath) {
        throw new WdkCliError(
          `Unsupported platform: ${platform()}`,
          ErrorCode.MISSING_CONFIG,
          'Claude Desktop is available on macOS, Windows, and Linux'
        )
      }
      return {
        name: 'Claude Desktop',
        configPath,
        checkInstalled: () => isClaudeDesktopInstalled() || existsSync(dirname(configPath)),
        notInstalledMessage: [
          'Install (if not installed): https://claude.ai/download',
          '',
          'Or configure manually in:',
          `  ${configPath}`,
          '',
          'Add to "mcpServers":',
          ...buildManualMcpJson()
        ],
        restartMessage: `Restart Claude Desktop${platform() === 'darwin' ? ' (Cmd+Q, then reopen)' : ''}`
      }
    }
    case 'claude-code': {
      const configPath = getClaudeCodeConfigPath()
      return {
        name: 'Claude Code',
        configPath,
        checkInstalled: () => {
          try {
            execSync('which claude 2>/dev/null || where claude 2>nul', {
              encoding: 'utf8',
              timeout: 5000,
              stdio: ['ignore', 'pipe', 'pipe']
            })
            return true
          } catch {
            return existsSync(join(homedir(), '.claude'))
          }
        },
        notInstalledMessage: [
          'Install (if not installed): https://docs.anthropic.com/en/docs/claude-code/overview',
          '',
          'Or add manually:',
          `  claude mcp add -s user wdk-wallet -- ${process.execPath} ${getMcpScriptPath()}`
        ],
        restartMessage: 'Start a new Claude Code session to use wdk-wallet tools',
        cliSetup: {
          add: (mcpConfig) => {
            try {
              const result = spawnSync(
                'claude',
                [
                  'mcp',
                  'add',
                  '-s',
                  'user',
                  'wdk-wallet',
                  '--',
                  mcpConfig.command,
                  ...mcpConfig.args
                ],
                { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }
              )
              return result.status === 0
            } catch {
              return false
            }
          },
          remove: () => {
            try {
              const result = spawnSync('claude', ['mcp', 'remove', '-s', 'user', 'wdk-wallet'], {
                encoding: 'utf8',
                timeout: 10000,
                stdio: ['ignore', 'pipe', 'pipe']
              })
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
          }
        }
      }
    }
    case 'openclaw': {
      const configPath = getOpenClawConfigPath()
      return {
        name: 'OpenClaw',
        configPath,
        serversPath: ['mcp', 'servers'],
        checkInstalled: () => {
          const result = spawnSync('openclaw', ['--version'], {
            encoding: 'utf8',
            timeout: 5000,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe']
          })
          if (result.status === 0) return true
          return existsSync(dirname(configPath))
        },
        notInstalledMessage: [
          'Install (if not installed): https://docs.openclaw.ai/install',
          '',
          'Or add manually:',
          `  openclaw mcp set wdk-wallet '${JSON.stringify({ command: process.execPath, args: [getMcpScriptPath()] })}'`
        ],
        restartMessage: 'Restart OpenClaw gateway: openclaw gateway restart',
        cliSetup: {
          add: (mcpConfig) => {
            try {
              const serverJson = JSON.stringify({ command: mcpConfig.command, args: mcpConfig.args }).replace(/"/g, '\\"')
              const result = spawnSync('openclaw', ['mcp', 'set', 'wdk-wallet', serverJson], {
                encoding: 'utf8',
                timeout: 10000,
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe']
              })
              return result.status === 0
            } catch {
              return false
            }
          },
          remove: () => {
            try {
              const result = spawnSync('openclaw', ['mcp', 'unset', 'wdk-wallet'], {
                encoding: 'utf8',
                timeout: 10000,
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe']
              })
              return result.status === 0
            } catch {
              return false
            }
          },
          isConfigured: () => {
            try {
              const result = spawnSync('openclaw', ['mcp', 'list'], {
                encoding: 'utf8',
                timeout: 10000,
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe']
              })
              return (result.stdout ?? '').includes('wdk-wallet')
            } catch {
              return false
            }
          }
        }
      }
    }
    default:
      throw new WdkCliError(
        `Unknown AI tool '${aiTool}'. Supported: ${SUPPORTED_AI_TOOLS.join(', ')}`,
        ErrorCode.INVALID_ARGUMENT
      )
  }
}

/**
 * Returns true if wdk-wallet is already registered in the given AI tool target config.
 *
 * @param {SetupTarget} target - The AI tool setup target descriptor.
 * @returns {boolean} Whether wdk-wallet is configured.
 */
function isConfigured (target) {
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
 * Registers the wdk-wallet MCP server in the given AI tool's config.
 *
 * @param {string} aiTool - The AI tool identifier.
 * @returns {SetupMcpResult} The setup outcome.
 */
export function setupMcp (aiTool) {
  const target = getSetupTarget(aiTool)

  if (!target.checkInstalled()) {
    throw new WdkCliError(
      `${target.name} not found`,
      ErrorCode.MISSING_CONFIG,
      target.notInstalledMessage.join('\n')
    )
  }

  if (target.cliSetup) {
    if (target.cliSetup.isConfigured()) {
      return {
        status: 'already_configured',
        targetName: target.name,
        configPath: null,
        mcpVerified: null,
        restartMessage: target.restartMessage
      }
    }
    const mcpConfig = getWdkMcpCommand()
    const mcpVerified = testMcpServer(mcpConfig)
    const ok = target.cliSetup.add(mcpConfig)
    return {
      status: ok ? 'added' : 'add_failed',
      targetName: target.name,
      configPath: null,
      mcpVerified,
      restartMessage: target.restartMessage
    }
  }

  const config = readOrCreateConfig(target.configPath)
  const serversPath = target.serversPath ?? ['mcpServers']
  const servers = getServersObject(config, serversPath)

  if ('wdk-wallet' in servers) {
    return {
      status: 'already_configured',
      targetName: target.name,
      configPath: target.configPath,
      mcpVerified: null,
      restartMessage: target.restartMessage
    }
  }

  const mcpConfig = getWdkMcpCommand()
  const mcpVerified = testMcpServer(mcpConfig)

  /** @type {{ command: string, args?: string[] }} */
  const serverEntry = { command: mcpConfig.command }
  if (mcpConfig.args && mcpConfig.args.length > 0) {
    serverEntry.args = mcpConfig.args
  }
  servers['wdk-wallet'] = serverEntry
  mkdirSync(dirname(target.configPath), { recursive: true })
  writeFileSync(target.configPath, JSON.stringify(config, null, 2) + '\n')

  return {
    status: 'added',
    targetName: target.name,
    configPath: target.configPath,
    mcpVerified,
    restartMessage: target.restartMessage
  }
}

/**
 * Unregisters the wdk-wallet MCP server from the given AI tool's config.
 *
 * @param {string} aiTool - The AI tool identifier.
 * @returns {RemoveMcpResult} The remove outcome.
 */
export function removeMcp (aiTool) {
  const target = getSetupTarget(aiTool)

  if (target.cliSetup) {
    if (!target.cliSetup.isConfigured()) {
      return {
        status: 'not_configured',
        targetName: target.name,
        restartMessage: target.restartMessage
      }
    }
    const ok = target.cliSetup.remove()
    return {
      status: ok ? 'removed' : 'remove_failed',
      targetName: target.name,
      restartMessage: target.restartMessage
    }
  }

  if (!existsSync(target.configPath)) {
    return {
      status: 'not_configured',
      targetName: target.name,
      restartMessage: target.restartMessage
    }
  }

  const config = readOrCreateConfig(target.configPath)
  const serversPath = target.serversPath ?? ['mcpServers']
  const servers = getServersObject(config, serversPath)

  if ('wdk-wallet' in servers) {
    delete servers['wdk-wallet']
    writeFileSync(target.configPath, JSON.stringify(config, null, 2) + '\n')
    return { status: 'removed', targetName: target.name, restartMessage: target.restartMessage }
  }

  return {
    status: 'not_configured',
    targetName: target.name,
    restartMessage: target.restartMessage
  }
}

/**
 * Verifies that wdk-wallet is configured for the given AI tool and that the MCP server responds.
 *
 * @param {string} aiTool - The AI tool identifier.
 * @returns {VerifyMcpResult} The verification outcome.
 */
export function verifyMcpSetup (aiTool) {
  const target = getSetupTarget(aiTool)
  const configured = isConfigured(target)
  const mcpConfig = getWdkMcpCommand()
  const mcpWorks = configured ? testMcpServer(mcpConfig) : null
  return {
    targetName: target.name,
    configured,
    mcpWorks,
    mcpCommand: mcpConfig.command,
    mcpArgs: mcpConfig.args
  }
}

/**
 * Returns the wdk-wallet configuration status for all supported AI tools.
 *
 * @returns {ListMcpEntry[]} The status entries, in display order.
 */
export function listMcpStatus () {
  /** @type {ListMcpEntry[]} */
  const entries = []

  if (getClaudeDesktopConfigPath()) {
    try {
      const target = getSetupTarget('claude-desktop')
      entries.push({
        name: 'Claude Desktop',
        status: isConfigured(target) ? 'configured' : 'not_configured'
      })
    } catch {
      entries.push({ name: 'Claude Desktop', status: 'error' })
    }
  } else {
    entries.push({ name: 'Claude Desktop', status: 'n/a' })
  }

  for (const [name, aiTool] of /** @type {[string, string][]} */ ([
    ['Claude Code', 'claude-code'],
    ['OpenClaw', 'openclaw']
  ])) {
    try {
      const target = getSetupTarget(aiTool)
      entries.push({ name, status: isConfigured(target) ? 'configured' : 'not_configured' })
    } catch {
      entries.push({ name, status: 'error' })
    }
  }

  return entries
}
