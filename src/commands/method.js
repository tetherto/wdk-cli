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

import ora from 'ora'
import { listMethods, listAllMethods, callMethod } from '../actions/method.js'
import { resolveIndex } from '../services/config-service.js'
import { splitParamUsage, parseMethodArgs } from '../services/methods.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'
import { createTable } from '../ui/tables.js'
import { nonNegativeInt } from '../ui/parsers.js'

/** @typedef {import('commander').Command} Command */
/** @typedef {import('../actions/method.js').MethodInfo} MethodInfo */

/**
 * Appends one table row per method.
 *
 * @param {import('cli-table3').Table} table - The output table.
 * @param {MethodInfo[]} methods - The method list.
 * @param {string} [modulePkg] - When set, prefix each row with the module package name.
 * @returns {void}
 */
function pushMethodRows (table, methods, modulePkg) {
  for (const method of methods) {
    const { required, optional } = splitParamUsage(method)
    const row = [
      method.name,
      method.kind,
      required.join('\n') || '-',
      optional.join('\n') || '-'
    ]
    table.push(modulePkg ? [modulePkg, ...row] : row)
  }
}

/**
 * Registers the `method` command group (list, call) on the root program.
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerMethodCommand (program) {
  const method = program
    .command('method')
    .description('Inspect and invoke wallet module methods')

  const list = method
    .command('list')
    .description('List the methods declared by a network\'s wallet module')
    .option('--network <network>', 'Blockchain network')
    .option('--all', 'List every module\'s declared methods')

  configureHelp(list, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network' },
      { flags: '--all', description: 'List every module\'s declared methods' }
    ]
  })

  list.action((options) => {
    try {
      if (!options.network === !options.all) {
        throw new WdkCliError('Provide --network <network> or --all.', ErrorCode.INVALID_ARGUMENT)
      }

      if (options.all) {
        const result = listAllMethods()
        if (program.opts().json) {
          console.log(JSON.stringify(result))
          return
        }
        if (result.modules.length === 0) {
          console.log('No wallet module declares methods.')
          return
        }
        console.log()
        const table = createTable(['Module', 'Method', 'Kind', 'Required', 'Optional'])
        for (const entry of result.modules) {
          pushMethodRows(table, entry.methods, entry.module)
        }
        console.log(table.toString())
        console.log()
        return
      }

      const result = listMethods({ network: options.network })
      if (program.opts().json) {
        console.log(JSON.stringify(result))
        return
      }
      if (result.methods.length === 0) {
        console.log(`The wallet module for '${result.network}' declares no methods.`)
        return
      }
      console.log()
      const table = createTable(['Method', 'Kind', 'Required', 'Optional'])
      pushMethodRows(table, result.methods)
      console.log(table.toString())
      console.log()
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  const call = method
    .command('call')
    .description('Invoke a declared method of a network\'s wallet module')
    .requiredOption('--network <network>', 'Blockchain network')
    .option('--name <name>', 'Method to invoke')
    .option('--wallet <name>', 'Wallet name')
    .option('--index <n>', 'Account index', nonNegativeInt)
    .allowUnknownOption()
    .allowExcessArguments()

  configureHelp(call, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network', required: true },
      { flags: '--name <name>', description: 'Method to invoke (see `wdk method list`)', required: true }
    ],
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' },
      { flags: '--<param> <value>', description: 'Method parameters, one flag per declared parameter' }
    ]
  })

  call.action(async (options, command) => {
    try {
      const network = options.network

      if (!options.name) {
        throw new WdkCliError(
          'Provide --name <name>.',
          ErrorCode.INVALID_ARGUMENT,
          `Run: wdk method list --network ${network}`
        )
      }

      const args = parseMethodArgs(command.args)
      const index = resolveIndex(options.index)

      const spinner = program.opts().json ? null : ora(`Calling ${options.name}...`).start()
      let result
      try {
        result = await callMethod({ network, name: options.name, args, index, wallet: options.wallet })
        spinner?.stop()
      } catch (error) {
        spinner?.fail()
        throw error
      }

      if (program.opts().json) {
        console.log(JSON.stringify(result))
        return
      }
      if (result.result === null) {
        console.log('Done.')
      } else if (typeof result.result === 'object') {
        console.log(JSON.stringify(result.result, null, 2))
      } else {
        console.log(String(result.result))
      }
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })
}
