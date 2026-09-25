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
import {
  listProviders,
  getProviderInfo,
  validateProviderSpec,
  verifyProviderKind,
  addProvider,
  deleteProvider
} from '../actions/provider.js'
import { setProviderEnabled } from '../services/protocol-service.js'
import { applyToggle } from '../ui/toggle.js'
import { handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'
import { requirePassphraseConfirmation } from '../ui/auth.js'
import { lockWalletsAfterChange } from '../ui/session.js'
import { createTable } from '../ui/tables.js'
import { loadJson } from '../ui/parsers.js'

/** @typedef {import('commander').Command} Command */

/**
 * Prints a config object as aligned key/value lines, or a dimmed placeholder
 * when it holds nothing.
 *
 * @param {Record<string, unknown>} config - The config to print.
 * @param {string} indent - Leading whitespace for every line.
 * @returns {void}
 */
function printConfig (config, indent) {
  const entries = Object.entries(config)
  if (entries.length === 0) {
    console.log(`${indent}${chalk.dim('(empty)')}`)
    return
  }
  const maxKey = Math.max(...entries.map(([k]) => k.length))
  for (const [key, value] of entries) {
    const display = value === '' || value === null || value === undefined
      ? chalk.dim('(not set)')
      : typeof value === 'object' ? JSON.stringify(value) : String(value)
    console.log(`${indent}${key.padEnd(maxKey + 2)}${display}`)
  }
}

/**
 * Registers the `provider` subcommand tree (list, info, add, delete, enable,
 * disable) on the root program.
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerProviderCommand (program) {
  const provider = program
    .command('provider')
    .description('Manage service providers')

  configureHelp(provider, {})

  const listCmd = provider
    .command('list')
    .description('List providers with their kind, backing module and status')

  configureHelp(listCmd, {})

  listCmd.action(() => {
    try {
      const result = listProviders()

      if (program.opts().json) {
        console.log(JSON.stringify(result))
        return
      }

      console.log()
      const table = createTable(['Name', 'Kind', 'Module', 'Source', 'Status'])
      for (const p of result.providers) {
        table.push([
          chalk.bold(p.name),
          p.kind,
          p.module ?? chalk.dim('—'),
          p.source === 'custom' ? 'custom' : chalk.dim('built-in'),
          p.enabled ? '' : chalk.dim('disabled')
        ])
      }
      console.log(table.toString())
      const enabledCount = result.providers.filter((p) => p.enabled).length
      console.log(chalk.dim(`\n  ${enabledCount} providers available`))
      console.log()
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  const infoCmd = provider
    .command('info')
    .description('Show a provider and the effective config its module receives')
    .requiredOption('--name <name>', 'Provider name')

  configureHelp(infoCmd, {
    params: [{ flags: '--name <name>', description: 'Provider name', required: true }]
  })

  infoCmd.action((options) => {
    try {
      const info = getProviderInfo(options.name)

      if (program.opts().json) {
        console.log(JSON.stringify(info))
        return
      }

      console.log()
      console.log(`  ${chalk.bold(info.name)}`)
      console.log()
      console.log(`  Kind:       ${info.kind}`)
      if (info.module) console.log(`  Module:     ${info.module}`)
      console.log(`  Source:     ${info.source}`)
      if (!info.enabled) console.log(`  Status:     ${chalk.dim('disabled')}`)
      console.log()
      console.log(chalk.bold('  Configuration:'))
      printConfig(info.config, '    ')
      for (const [network, config] of Object.entries(info.networks)) {
        console.log()
        console.log(chalk.bold(`  On ${network}:`))
        printConfig(config, '    ')
      }
      console.log()
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  const addCmd = provider
    .command('add')
    .description('Register a provider backed by an installed module, from a JSON spec (inline or file path)')
    .argument('<data>', 'JSON string or path to JSON file')

  configureHelp(addCmd, {
    args: [
      {
        flags: '<data>',
        description: 'JSON string or path to JSON file: {"name","kind","module","config"?,"networks"?}',
        required: true
      }
    ]
  })

  addCmd.action(async (dataArg) => {
    try {
      const spec = validateProviderSpec(loadJson(dataArg, '<data>'))

      if (!program.opts().json) {
        console.log(`\n  Provider:  ${spec.name}`)
        console.log(`  Kind:      ${spec.kind}`)
        console.log(`  Module:    ${spec.module}`)
        console.log(chalk.yellow('\n  This module runs inside the wallet daemon with access to your accounts.'))
        console.log(chalk.yellow('  Only register modules you trust.\n'))
      }
      // Confirm before loading: verifying the kind runs the module's code.
      await requirePassphraseConfirmation()
      await verifyProviderKind(spec)

      const result = addProvider(spec)

      if (program.opts().json) {
        const walletsLocked = await lockWalletsAfterChange(true)
        console.log(JSON.stringify({ ...result, walletsLocked }))
        return
      }
      console.log(chalk.green(`Provider '${result.name}' added as ${result.kind}.`))
      if (spec.config) console.log(`  Config:     ${Object.keys(spec.config).length} keys`)
      if (spec.networks) console.log(`  Networks:   ${Object.keys(spec.networks).join(', ')}`)
      await lockWalletsAfterChange(false)
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  const deleteCmd = provider
    .command('delete')
    .description('Delete a provider you added')
    .requiredOption('--name <name>', 'Provider name to delete')

  configureHelp(deleteCmd, {
    params: [{ flags: '--name <name>', description: 'Provider name to delete', required: true }]
  })

  deleteCmd.action(async (options) => {
    try {
      await requirePassphraseConfirmation()

      const result = deleteProvider(options.name)

      if (program.opts().json) {
        const walletsLocked = await lockWalletsAfterChange(true)
        console.log(JSON.stringify({ ...result, walletsLocked }))
        return
      }
      console.log(chalk.green(`Provider '${result.name}' deleted.`))
      await lockWalletsAfterChange(false)
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  for (const enabled of [false, true]) {
    const cmd = provider
      .command(enabled ? 'enable' : 'disable')
      .description(`${enabled ? 'Enable' : 'Disable'} a provider`)
      .requiredOption('--name <name>', 'Provider name')

    configureHelp(cmd, {
      params: [{ flags: '--name <name>', description: 'Provider name', required: true }]
    })

    cmd.action(async (options) => {
      try {
        await applyToggle(program, {
          apply: () => setProviderEnabled(options.name, enabled),
          enabled,
          label: `Provider '${options.name}'`,
          result: { provider: options.name }
        })
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })
  }
}
