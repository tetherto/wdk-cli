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

import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import {
  getModuleStatuses,
  getInstalledVersion,
  resolveAddTarget,
  assertRemovable,
  saveCustomModule,
  removeCustomModule
} from '../services/module-service.js'
import { parseModuleName } from '../config/networks.js'
import { requirePassphraseConfirmation } from '../ui/auth.js'
import { daemonClient } from '../daemon/client.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'
import { createTable } from '../ui/tables.js'

/** @typedef {import('commander').Command} Command */

const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Runs an npm command against the CLI root.
 *
 * @param {string[]} args - The npm arguments (e.g. ["install", "--no-save", "pkg@1.0.0"]).
 * @param {{ capture?: boolean, quiet?: boolean }} [opts] - Capture stdout instead of streaming; quiet drops stdout.
 * @returns {string} The captured stdout when capture is set, otherwise an empty string.
 * @throws {WdkCliError} When npm exits with a failure.
 */
function runNpm (args, { capture = false, quiet = false } = {}) {
  try {
    // Node refuses to spawn npm.cmd without a shell (CVE-2024-27980), so Windows
    // must go through cmd.exe; macOS and Linux run npm directly, with no shell.
    const stdout = execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args,
      {
        cwd: CLI_ROOT,
        encoding: 'utf8',
        stdio: capture || quiet ? ['ignore', 'pipe', 'inherit'] : 'inherit',
        shell: process.platform === 'win32'
      }
    )
    return stdout ? stdout.trim() : ''
  } catch {
    throw new WdkCliError(
      `npm ${args[0]} failed.`,
      ErrorCode.NETWORK_ERROR,
      'Check the npm output above and your network connection, then run the command again.'
    )
  }
}

/**
 * Registers the `module` command group (list, add, remove) on the root program.
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerModuleCommand (program) {
  const module = program
    .command('module')
    .description('Manage WDK module packages')

  const list = module
    .command('list')
    .description('Show built-in and custom modules with pinned and installed versions')

  list.action(() => {
    try {
      const modules = getModuleStatuses()
      if (program.opts().json) {
        console.log(JSON.stringify({ modules }))
        return
      }
      console.log()
      const table = createTable(['Module', 'Pinned', 'Installed', 'Status', 'Source'])
      for (const s of modules) {
        table.push([s.module, s.pinned, s.installed ?? '-', s.status, s.source])
      }
      console.log(table.toString())
      console.log()
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  const add = module
    .command('add')
    .description('Add a custom module package and install it')
    .requiredOption('--name <package>', 'npm package name, optionally with @version')

  configureHelp(add, {
    params: [
      { flags: '--name <package>', description: 'npm package name, optionally with @version (default: latest, pinned once)', required: true }
    ]
  })

  add.action(async (options) => {
    try {
      const { name, version: specVersion } = parseModuleName(options.name)
      const target = resolveAddTarget(name, specVersion)

      const version = target.version || runNpm(['view', name, 'version'], { capture: true })
      if (!version) {
        throw new WdkCliError(`Cannot resolve a version for '${name}'.`, ErrorCode.INVALID_ARGUMENT)
      }

      if (!program.opts().json) {
        console.log(`\n  Package:   ${name}`)
        console.log(`  Version:   ${version}`)
        console.log(`  Publisher: ${name.startsWith('@') ? name.split('/')[0] : 'unscoped'}`)
        console.log(chalk.yellow('\n  This code will run inside the wallet daemon with access to your accounts.'))
        console.log(chalk.yellow('  Only add packages you trust.\n'))
      }
      await requirePassphraseConfirmation()

      if (await daemonClient.isRunning()) {
        await daemonClient.lock()
      }
      runNpm(['install', '--no-save', `${name}@${version}`], { quiet: program.opts().json })
      saveCustomModule(name, version)

      if (program.opts().json) {
        console.log(JSON.stringify({ module: name, version, installed: getInstalledVersion(name) }))
        return
      }
      console.log(`\nModule '${name}@${version}' ${target.repair ? 'reinstalled' : 'added'}.`)
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  const remove = module
    .command('remove')
    .description('Remove a custom module package')
    .requiredOption('--name <package>', 'npm package name')

  configureHelp(remove, {
    params: [
      { flags: '--name <package>', description: 'npm package name', required: true }
    ]
  })

  remove.action(async (options) => {
    try {
      const name = options.name
      assertRemovable(name)
      await requirePassphraseConfirmation()
      if (await daemonClient.isRunning()) {
        await daemonClient.lock()
      }
      removeCustomModule(name)
      runNpm(['uninstall', '--no-save', name], { quiet: program.opts().json })

      if (program.opts().json) {
        console.log(JSON.stringify({ module: name, removed: true }))
        return
      }
      console.log(`Module '${name}' removed.`)
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })
}
