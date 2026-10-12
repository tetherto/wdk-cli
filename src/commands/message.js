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
import ora from 'ora'
import { resolveIndex } from '../services/config-service.js'
import { handleError } from '../errors/index.js'
import { formatNetworkLabel } from '../ui/formatters.js'
import { configureHelp } from '../ui/help.js'
import { nonNegativeInt } from '../ui/parsers.js'
import { signMessage, verifyMessage } from '../actions/message.js'

/** @typedef {import('commander').Command} Command */

/**
 * Registers the `message` command group (sign, verify) on the root program.
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerMessageCommand (program) {
  const message = program
    .command('message')
    .description('Sign and verify messages with a wallet account key')

  configureHelp(message, {})

  const sign = message
    .command('sign')
    .description('Sign an arbitrary message with the account\'s private key')
    .requiredOption('--network <network>', 'Blockchain network')
    .requiredOption('--message <message>', 'Message to sign')
    .option('--wallet <name>', 'Wallet name')
    .option('--index <n>', 'Account index', nonNegativeInt)

  configureHelp(sign, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network', required: true },
      { flags: '--message <message>', description: 'Message to sign', required: true }
    ],
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' }
    ]
  })

  sign.action(async (options) => {
    try {
      const index = resolveIndex(options.index)

      const spinner = program.opts().json ? null : ora('Signing message...').start()
      let result
      try {
        result = await signMessage({
          network: options.network,
          message: options.message,
          index,
          wallet: options.wallet
        })
        spinner?.stop()
      } catch (error) {
        spinner?.fail()
        throw error
      }

      if (program.opts().json) {
        console.log(JSON.stringify(result))
        return
      }

      console.log()
      console.log(`  Network:   ${formatNetworkLabel(result.network)}`)
      console.log(`  Index:     ${result.index}`)
      console.log(`  Address:   ${result.address}`)
      console.log(`  Signature: ${chalk.cyan(result.signature)}`)
      console.log()
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  const verify = message
    .command('verify')
    .description('Verify a message signature against the account\'s key')
    .requiredOption('--network <network>', 'Blockchain network')
    .requiredOption('--message <message>', 'Signed message')
    .requiredOption('--signature <signature>', 'Signature to check')
    .option('--wallet <name>', 'Wallet name')
    .option('--index <n>', 'Account index', nonNegativeInt)

  configureHelp(verify, {
    params: [
      { flags: '--network <network>', description: 'Blockchain network', required: true },
      { flags: '--message <message>', description: 'Signed message', required: true },
      { flags: '--signature <signature>', description: 'Signature to check', required: true }
    ],
    options: [
      { flags: '--wallet <name>', description: 'Wallet name (default: default wallet)' },
      { flags: '--index <n>', description: 'Account index (default: 0)' }
    ]
  })

  verify.action(async (options) => {
    try {
      const index = resolveIndex(options.index)

      const spinner = program.opts().json ? null : ora('Verifying signature...').start()
      let result
      try {
        result = await verifyMessage({
          network: options.network,
          message: options.message,
          signature: options.signature,
          index,
          wallet: options.wallet
        })
        spinner?.stop()
      } catch (error) {
        spinner?.fail()
        throw error
      }

      if (program.opts().json) {
        console.log(JSON.stringify(result))
        return
      }

      console.log()
      console.log(`  Network: ${formatNetworkLabel(result.network)}`)
      console.log(`  Index:   ${result.index}`)
      console.log(`  Address: ${result.address}`)
      console.log(
        `  Valid:   ${result.valid ? chalk.green('yes') : chalk.red('no')}`
      )
      console.log()
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })
}
