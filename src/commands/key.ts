import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { KeyService } from '../services/key-service.js'
import { Keyring } from '../security/keyring.js'
import { promptPassword, promptSeedPhrase, promptConfirm } from '../ui/prompts.js'
import { handleError } from '../errors/index.js'
import { getKeyringPath } from '../config/constants.js'

function createKeyService(): KeyService {
  return new KeyService(new Keyring(getKeyringPath()))
}

export function registerKeyCommand(program: Command): void {
  const key = program
    .command('key')
    .description('Manage seed phrases and keys')

  key
    .command('generate')
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

  key
    .command('import')
    .description('Import an existing BIP-39 seed phrase')
    .action(async () => {
      try {
        const keyService = createKeyService()

        if (await keyService.hasKey()) {
          const overwrite = await promptConfirm(
            'A key already exists. Overwrite it?',
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

  key
    .command('status')
    .description('Check if a key is stored')
    .action(async () => {
      try {
        const keyService = createKeyService()
        const exists = await keyService.hasKey()

        if (program.opts().json) {
          console.log(JSON.stringify({ hasKey: exists }))
        } else if (exists) {
          console.log(chalk.green('A seed phrase is stored and encrypted.'))
        } else {
          console.log(chalk.yellow('No seed phrase found.'))
          console.log(chalk.dim('Run `wdk key generate` or `wdk key import` to get started.'))
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}
