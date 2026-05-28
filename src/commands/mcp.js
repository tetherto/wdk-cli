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

import chalk from 'chalk'
import { handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'
import {
  setupMcp,
  removeMcp,
  verifyMcpSetup,
  listMcpStatus,
  SUPPORTED_AI_TOOLS
} from '../setup/ai-tools.js'

/** @typedef {import('commander').Command} Command */
/** @typedef {import('../setup/ai-tools.js').SetupMcpResult} SetupMcpResult */
/** @typedef {import('../setup/ai-tools.js').RemoveMcpResult} RemoveMcpResult */
/** @typedef {import('../setup/ai-tools.js').VerifyMcpResult} VerifyMcpResult */
/** @typedef {import('../setup/ai-tools.js').ListMcpEntry} ListMcpEntry */

/**
 * Prints the verification line for the MCP server check during setup.
 *
 * @param {boolean} verified - true if the MCP server responded correctly, false otherwise.
 * @returns {void}
 */
function printMcpVerification (verified) {
  process.stdout.write(chalk.dim('  Verifying MCP server... '))
  if (verified) {
    console.log(chalk.green('OK'))
  } else {
    console.log(chalk.yellow('SKIP'))
    console.log(chalk.dim('    Could not verify MCP server (may still work)'))
  }
}

/**
 * Formats and prints the result of a setup attempt.
 *
 * @param {SetupMcpResult} r - The setup outcome.
 * @returns {void}
 */
function printSetupResult (r) {
  console.log()
  if (r.status === 'already_configured') {
    console.log(chalk.green(`  ✓ wdk-wallet is already configured in ${r.targetName}`))
    if (r.configPath) console.log(chalk.dim(`    Config: ${r.configPath}`))
    console.log(chalk.dim('    To reinstall: wdk mcp remove --ai-tool <name>, then re-run setup'))
    console.log()
    return
  }

  printMcpVerification(r.mcpVerified === true)

  if (r.status === 'added') {
    console.log(chalk.green(`  ✓ Added wdk-wallet to ${r.targetName}`))
    if (r.configPath) console.log(chalk.dim(`    Config: ${r.configPath}`))
  } else {
    console.log(chalk.red(`  ✗ Failed to add wdk-wallet to ${r.targetName}`))
  }

  console.log()
  console.log(chalk.dim(`  ${r.restartMessage}`))
  console.log()
}

/**
 * Formats and prints the result of a remove attempt.
 *
 * @param {RemoveMcpResult} r - The remove outcome.
 * @returns {void}
 */
function printRemoveResult (r) {
  console.log()
  switch (r.status) {
    case 'not_configured':
      console.log(chalk.dim(`  wdk-wallet is not configured in ${r.targetName}`))
      break
    case 'removed':
      console.log(chalk.green(`  ✓ Removed wdk-wallet from ${r.targetName}`))
      console.log(chalk.dim(`    ${r.restartMessage}`))
      break
    case 'remove_failed':
      console.log(chalk.red(`  ✗ Failed to remove wdk-wallet from ${r.targetName}`))
      break
  }
  console.log()
}

/**
 * Formats and prints the result of a verify-setup check.
 *
 * @param {VerifyMcpResult} r - The verification outcome.
 * @param {string} aiTool - The original --ai-tool argument (for the setup-hint command).
 * @returns {void}
 */
function printVerifyResult (r, aiTool) {
  console.log()
  if (r.configured) {
    console.log(chalk.green(`  ✓ wdk-wallet found in ${r.targetName}`))
  } else {
    console.log(chalk.red(`  ✗ wdk-wallet not found in ${r.targetName}`))
    console.log(chalk.dim(`    Run: wdk mcp setup --ai-tool ${aiTool}`))
  }

  if (r.configured) {
    process.stdout.write(chalk.dim('  Testing MCP server... '))
    if (r.mcpWorks) {
      console.log(chalk.green('OK'))
    } else {
      console.log(chalk.red('FAILED'))
      console.log(chalk.dim('    MCP server did not respond correctly'))
      console.log(chalk.dim(`    Command: ${r.mcpCommand} ${r.mcpArgs.join(' ')}`))
    }
  }

  console.log()
}

/**
 * Formats and prints the list of AI-tool MCP statuses.
 *
 * @param {ListMcpEntry[]} entries - The status entries to print.
 * @returns {void}
 */
function printList (entries) {
  console.log()
  for (const { name, status } of entries) {
    let formatted
    if (status === 'configured') formatted = chalk.green('✓ configured')
    else if (status === 'not_configured') formatted = chalk.dim('not configured')
    else if (status === 'n/a') formatted = chalk.dim('n/a')
    else formatted = chalk.yellow('error')
    console.log(`  ${name.padEnd(20)} ${formatted}`)
  }
  console.log()
}

/**
 * Registers the `mcp` subcommand tree (setup, remove, verify-setup, list) on the root program.
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerMcpCommand (program) {
  const mcp = program.command('mcp').description('Manage WDK MCP server')

  configureHelp(mcp, {})

  const setup = mcp
    .command('setup')
    .description('Configure WDK MCP server for an AI tool')
    .requiredOption('--ai-tool <name>', `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`)

  configureHelp(setup, {
    params: [
      {
        flags: '--ai-tool <name>',
        description: `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`,
        required: true
      }
    ]
  })

  setup.action((options) => {
    try {
      printSetupResult(setupMcp(options.aiTool))
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
      {
        flags: '--ai-tool <name>',
        description: `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`,
        required: true
      }
    ]
  })

  remove.action((options) => {
    try {
      printRemoveResult(removeMcp(options.aiTool))
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
      {
        flags: '--ai-tool <name>',
        description: `AI tool: ${SUPPORTED_AI_TOOLS.join(', ')}`,
        required: true
      }
    ]
  })

  verifySetup.action((options) => {
    try {
      printVerifyResult(verifyMcpSetup(options.aiTool), options.aiTool)
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })

  const list = mcp.command('list').description('Show WDK MCP server status across all AI tools')

  configureHelp(list, {})

  list.action(() => {
    try {
      printList(listMcpStatus())
    } catch (e) {
      handleError(e, program.opts().verbose, program.opts().json)
    }
  })
}
