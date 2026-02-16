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

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { KeyService } from '../services/key-service.js'
import { Keyring } from '../security/keyring.js'
import { sessionService } from '../services/session-service.js'
import { getKeyringPath, SESSION_TTL_MINUTES } from '../config/constants.js'
import { KeyNotFoundError, handleError } from '../errors/index.js'
import { promptPassword, promptSeedPhrase, promptConfirm } from '../ui/prompts.js'

function createKeyService(): KeyService {
  return new KeyService(new Keyring(getKeyringPath()))
}

export function registerWalletCommand(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Manage wallet keys and sessions')

  wallet
    .command('create')
    .description('Generate a new BIP-39 seed phrase')
    .option('--words <count>', 'Word count: 12 or 24', '12')
    .action(async (options) => {
      try {
        const wordCount = parseInt(options.words, 10) as 12 | 24
        if (wordCount !== 12 && wordCount !== 24) {
          console.error(chalk.red('Error: --words must be 12 or 24'))
          process.exit(1)
        }

        const keyService = createKeyService()

        if (await keyService.hasKey()) {
          const overwrite = await promptConfirm(
            'A wallet already exists. Overwrite it?',
          )
          if (!overwrite) {
            console.log('Cancelled.')
            return
          }
        }

        const seedPhrase = keyService.generate(wordCount)

        const isJson = program.opts().json
        if (isJson) {
          console.log(JSON.stringify({ seedPhrase, wordCount }))
        } else {
          console.log()
          console.log(chalk.bold.yellow('WARNING: Store this seed phrase safely. It cannot be recovered!'))
          console.log()
          console.log(chalk.bold('Seed phrase:'))
          console.log()

          const words = seedPhrase.split(' ')
          words.forEach((word, i) => {
            const num = String(i + 1).padStart(2, ' ')
            console.log(`  ${chalk.dim(num + '.')} ${word}`)
          })
          console.log()
        }

        const shouldStore = isJson || await promptConfirm('Encrypt and store this seed phrase?')
        if (shouldStore) {
          const password = await promptPassword('Create a password to encrypt your seed phrase:')
          const confirmPw = await promptPassword('Confirm password:')

          if (password !== confirmPw) {
            console.error(chalk.red('Error: Passwords do not match.'))
            process.exit(1)
          }

          const spinner = ora('Encrypting and storing seed phrase...').start()
          await keyService.store(seedPhrase, password)
          spinner.succeed('Seed phrase encrypted and stored.')
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  wallet
    .command('import')
    .description('Import an existing BIP-39 seed phrase')
    .action(async () => {
      try {
        const keyService = createKeyService()

        if (await keyService.hasKey()) {
          const overwrite = await promptConfirm(
            'A wallet already exists. Overwrite it?',
          )
          if (!overwrite) {
            console.log('Import cancelled.')
            return
          }
        }

        console.log(chalk.dim('Enter your BIP-39 seed phrase (12 or 24 words).'))
        const seedPhrase = (await promptSeedPhrase()).trim()

        if (!keyService.validate(seedPhrase)) {
          console.error(chalk.red('Error: Invalid seed phrase. Must be 12 or 24 valid BIP-39 words.'))
          process.exit(1)
        }

        const password = await promptPassword('Create a password to encrypt your seed phrase:')
        const confirmPw = await promptPassword('Confirm password:')

        if (password !== confirmPw) {
          console.error(chalk.red('Error: Passwords do not match.'))
          process.exit(1)
        }

        const spinner = ora('Encrypting and storing seed phrase...').start()
        await keyService.store(seedPhrase, password)
        spinner.succeed('Seed phrase imported and encrypted.')
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  wallet
    .command('export')
    .description('Export seed phrase (decrypt and display)')
    .action(async () => {
      try {
        const keyService = createKeyService()

        if (!(await keyService.hasKey())) {
          throw new KeyNotFoundError()
        }

        const password = await promptPassword('Enter password to decrypt seed phrase:')
        const seedPhrase = await keyService.unlock(password)

        if (program.opts().json) {
          console.log(JSON.stringify({ seedPhrase }))
          return
        }

        console.log()
        console.log(chalk.bold.yellow('WARNING: Do not share your seed phrase with anyone!'))
        console.log()
        console.log(chalk.bold('Seed phrase:'))
        console.log()

        const words = seedPhrase.split(' ')
        words.forEach((word, i) => {
          const num = String(i + 1).padStart(2, ' ')
          console.log(`  ${chalk.dim(num + '.')} ${word}`)
        })
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  wallet
    .command('unlock')
    .description('Unlock wallet session (skip password prompts for subsequent commands)')
    .option('--ttl <minutes>', 'Session duration in minutes', String(SESSION_TTL_MINUTES))
    .action(async (options) => {
      try {
        const keyService = new KeyService(new Keyring(getKeyringPath()))
        if (!(await keyService.hasKey())) {
          throw new KeyNotFoundError()
        }

        if (await sessionService.isActive()) {
          const remaining = await sessionService.ttlRemaining()
          const mins = Math.ceil(remaining / 60000)
          console.log(chalk.yellow(`  Wallet already unlocked (${mins} min remaining)`))
          return
        }

        const password = await promptPassword('Enter password to unlock wallet:')
        const seedPhrase = await keyService.unlock(password)
        const ttl = parseInt(options.ttl, 10)
        await sessionService.create(seedPhrase, ttl)

        console.log()
        console.log(chalk.green('  Wallet unlocked'))
        console.log(chalk.dim(`  Session expires in ${ttl} minutes`))
        console.log(chalk.dim('  Run `wdk wallet lock` to end session early'))
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  wallet
    .command('lock')
    .description('Lock wallet and end active session')
    .action(async () => {
      try {
        await sessionService.destroy()
        console.log()
        console.log(chalk.green('  Wallet locked'))
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}
