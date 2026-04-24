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
import { WalletKeyring } from '../security/keyring.js'
import { daemonClient } from '../daemon/client.js'
import { configService } from '../services/config-service.js'
import { SESSION_TTL_MINUTES } from '../config/constants.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { promptPassphrase, promptSeedPhrase, promptConfirm } from '../ui/prompts.js'
import { configureHelp } from '../ui/help.js'

function createKeyService(): KeyService {
  return new KeyService(new WalletKeyring())
}

export function registerWalletCommand(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Manage wallets, keys, and sessions')

  configureHelp(wallet, {})

  wallet.hook('preAction', () => {
      if (program.opts().json) {
        console.error(chalk.red('Error: --json is not supported for wallet commands.'))
        process.exit(1)
      }
    })

  const create = wallet
    .command('create')
    .description('Create a new wallet with a generated seed phrase')
    .requiredOption('--name <name>', 'Wallet name')
    .option('--words <count>', 'Word count: 12 or 24', '12')

  configureHelp(create, {
    params: [
      { flags: '--name <name>', description: 'Wallet name', required: true },
    ],
    options: [
      { flags: '--words <count>', description: 'Word count: 12 or 24 (default: 12)' },
    ],
  })

  create.action(async (options) => {
      const name: string = options.name
      try {
        const wordCount = parseInt(options.words, 10) as 12 | 24
        if (wordCount !== 12 && wordCount !== 24) {
          console.error(chalk.red('Error: --words must be 12 or 24'))
          process.exit(1)
        }

        const keyService = createKeyService()

        if (await keyService.hasKey(name)) {
          throw new WdkCliError(`Wallet '${name}' already exists.`, ErrorCode.WALLET_EXISTS)
        }

        const seedPhrase = keyService.generate(wordCount)

        console.log(chalk.dim('Enter a passphrase to encrypt your seed phrase. Remember the passphrase to unlock this wallet in the future.'))
        console.log()

        const passphrase = await promptPassphrase('Passphrase (empty for none):')
        const confirmPw = await promptPassphrase('Confirm passphrase:')
        if (passphrase !== confirmPw) {
          throw new WdkCliError('Passphrases do not match.', ErrorCode.PASSPHRASE_MISMATCH)
        }

        const spinner = ora('Encrypting and storing seed phrase...').start()
        await keyService.store(seedPhrase, passphrase, name)
        spinner.succeed(`Seed phrase encrypted and stored as '${name}'.`)

        console.log()
        console.log(chalk.bold.yellow('WARNING: Store this seed phrase safely. Do not share it with anyone.'))
        console.log()
        console.log(chalk.bold('Seed phrase:'))
        console.log()
        console.log(`  ${seedPhrase}`)
        console.log()

        if (!configService.getDefaultWallet()) {
          configService.setDefaultWallet(name)
          console.log(chalk.dim(`  Set as default wallet.`))
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const importCmd = wallet
    .command('import')
    .description('Import a wallet from an existing seed phrase')
    .requiredOption('--name <name>', 'Wallet name')

  configureHelp(importCmd, {
    params: [
      { flags: '--name <name>', description: 'Wallet name', required: true },
    ],
  })

  importCmd.action(async (options) => {
      const name: string = options.name
      try {
        const keyService = createKeyService()

        if (await keyService.hasKey(name)) {
          throw new WdkCliError(`Wallet '${name}' already exists.`, ErrorCode.WALLET_EXISTS)
        }

        console.log(chalk.dim('Enter your BIP-39 seed phrase (12 or 24 words).'))
        const seedPhrase = (await promptSeedPhrase()).trim()

        if (!keyService.validate(seedPhrase)) {
          console.error(chalk.red('Error: Invalid seed phrase. Must be 12 or 24 valid BIP-39 words.'))
          process.exit(1)
        }

        console.log(chalk.dim('Enter a passphrase to encrypt your seed phrase. Remember the passphrase to unlock this wallet in the future.'))
        console.log()

        const passphrase = await promptPassphrase('Passphrase (empty for none):')
        const confirmPw = await promptPassphrase('Confirm passphrase:')
        if (passphrase !== confirmPw) {
          throw new WdkCliError('Passphrases do not match.', ErrorCode.PASSPHRASE_MISMATCH)
        }

        const spinner = ora('Encrypting and storing seed phrase...').start()
        await keyService.store(seedPhrase, passphrase, name)
        spinner.succeed(`Seed phrase imported and encrypted as '${name}'.`)

        if (!configService.getDefaultWallet()) {
          configService.setDefaultWallet(name)
          console.log(chalk.dim(`  Set as default wallet.`))
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const exportCmd = wallet
    .command('export')
    .description('Export seed phrase (decrypt and display)')
    .requiredOption('--name <name>', 'Wallet name')

  configureHelp(exportCmd, {
    params: [
      { flags: '--name <name>', description: 'Wallet name', required: true },
    ],
  })

  exportCmd.action(async (options) => {
      const name: string = options.name
      try {
        const keyService = createKeyService()

        if (!(await keyService.hasKey(name))) {
          throw new WdkCliError('No key found.', ErrorCode.KEY_NOT_FOUND)
        }

        const passphrase = await promptPassphrase(`Enter passphrase of '${name}' wallet:`)
        const seedPhrase = await keyService.unlock(passphrase, name)

        console.log()
        console.log(chalk.bold.yellow('WARNING: Do not share your seed phrase with anyone!'))
        console.log()
        console.log(chalk.bold('Seed phrase:'))
        console.log()
        console.log(`  ${seedPhrase}`)
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const listCmd = wallet
    .command('list')
    .description('List all wallets')

  configureHelp(listCmd, {})

  listCmd.action(async () => {
      try {
        const keyService = createKeyService()

        const wallets = await keyService.list()

        if (wallets.length === 0) {
          console.log(chalk.dim('  No wallets found. Run `wdk wallet create --name <name>` to get started.'))
          return
        }

        let unlockedWallets: { name: string; ttlMs: number; ttlRemaining: number }[] = []
        try {
          if (await daemonClient.isRunning()) {
            unlockedWallets = await daemonClient.listWallets()
          }
        } catch { /* daemon not running */ }

        const defaultWallet = configService.getDefaultWallet()

        console.log()
        console.log(chalk.bold('Wallets:'))
        console.log()
        for (const name of wallets) {
          const isDefault = name === defaultWallet ? chalk.dim(' [default]') : ''
          const unlocked = unlockedWallets.find((w) => w.name === name)
          let status: string
          if (unlocked) {
            if (unlocked.ttlMs === 0) {
              status = chalk.green(' ✓') + chalk.dim(' (unlimited)')
            } else {
              const mins = Math.ceil(unlocked.ttlRemaining / 60000)
              status = chalk.green(' ✓') + chalk.dim(` (${mins} min remaining)`)
            }
          } else {
            status = chalk.dim(' locked')
          }
          console.log(`  ${chalk.green('•')} ${name}${isDefault}${status}`)
        }
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const deleteCmd = wallet
    .command('delete')
    .description('Delete a wallet')
    .requiredOption('--name <name>', 'Wallet name')

  configureHelp(deleteCmd, {
    params: [
      { flags: '--name <name>', description: 'Wallet name', required: true },
    ],
  })

  deleteCmd.action(async (options) => {
      const name: string = options.name
      try {
        const keyService = createKeyService()

        if (!(await keyService.hasKey(name))) {
          console.error(chalk.red(`Error: Wallet '${name}' not found.`))
          process.exit(1)
        }

        const passphrase = await promptPassphrase(`Enter passphrase of '${name}' wallet to confirm deletion:`)
        await keyService.unlock(passphrase, name)

        const confirm = await promptConfirm(`Delete wallet '${name}'? This cannot be undone.`)
        if (!confirm) {
          console.log('Cancelled.')
          return
        }

        try {
          if (await daemonClient.isRunning()) {
            await daemonClient.lockWallet(name)
          }
        } catch { /* */ }

        await keyService.destroy(name)
        console.log(chalk.green(`  Wallet '${name}' deleted.`))

        if (configService.getDefaultWallet() === name) {
          const remaining = await keyService.list()
          if (remaining.length > 0) {
            configService.setDefaultWallet(remaining[0])
            console.log(chalk.dim(`  Default wallet changed to '${remaining[0]}'.`))
          } else {
            configService.setDefaultWallet('')
          }
        }
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const unlockCmd = wallet
    .command('unlock')
    .description('Unlock a wallet (starts background daemon if needed)')
    .requiredOption('--name <name>', 'Wallet name')
    .option('--ttl <minutes>', 'Session duration in minutes (0 = unlimited)', String(SESSION_TTL_MINUTES))

  configureHelp(unlockCmd, {
    params: [
      { flags: '--name <name>', description: 'Wallet name', required: true },
    ],
    options: [
      { flags: '--ttl <minutes>', description: `Session duration in minutes, 0 = unlimited (default: ${SESSION_TTL_MINUTES})` },
    ],
  })

  unlockCmd.action(async (options) => {
      const name: string = options.name
      try {
        const keyService = createKeyService()

        if (!(await keyService.hasKey(name))) {
          throw new WdkCliError('No key found.', ErrorCode.KEY_NOT_FOUND)
        }

        const ttl = parseInt(options.ttl, 10)

        if (await daemonClient.isRunning()) {
          try {
            const status = await daemonClient.status()
            const existing = status.wallets.find((w) => w.name === name)
            if (existing) {
              await daemonClient.unlockWallet(name, '', ttl)
              if (ttl === 0) {
                console.log(chalk.yellow(`  Wallet '${name}' already unlocked (timer set to unlimited)`))
              } else {
                console.log(chalk.yellow(`  Wallet '${name}' already unlocked (timer reset to ${ttl} min)`))
              }
              return
            }
          } catch { /* daemon unreachable, continue */ }
        }

        const passphrase = await promptPassphrase(`Enter passphrase to unlock '${name}':`)

        await keyService.unlock(passphrase, name)

        const spinner = ora(`Unlocking '${name}'...`).start()
        await daemonClient.ensureRunning()
        await daemonClient.unlockWallet(name, passphrase, ttl)

        spinner.succeed(`Wallet '${name}' unlocked`)

        console.log()
        if (ttl === 0) {
          console.log(chalk.dim('  Session will not expire'))
        } else {
          console.log(chalk.dim(`  Session locks after ${ttl} minutes`))
        }
        console.log(chalk.dim(`  Run \`wdk wallet lock --name ${name}\` to end session`))
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const lockCmd = wallet
    .command('lock')
    .description('Lock a wallet (omit --name to lock all)')
    .option('--name <name>', 'Wallet name')

  configureHelp(lockCmd, {
    params: [
      { flags: '--name <name>', description: 'Wallet name (omit to lock all)' },
    ],
  })

  lockCmd.action(async (options) => {
      const name: string | undefined = options.name
      try {
        if (!name) {
          if (await daemonClient.isRunning()) {
            await daemonClient.lock()
          }

          console.log()
          console.log(chalk.green('  All wallets locked'))
          console.log()
          return
        }

        if (!(await daemonClient.isRunning())) {
          console.log(chalk.dim(`  Wallet '${name}' is already locked.`))
          return
        }

        await daemonClient.lockWallet(name)

        console.log()
        console.log(chalk.green(`  Wallet '${name}' locked`))
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const defaultCmd = wallet
    .command('default')
    .description('Set the default wallet')
    .requiredOption('--name <name>', 'Wallet name')

  configureHelp(defaultCmd, {
    params: [
      { flags: '--name <name>', description: 'Wallet name', required: true },
    ],
  })

  defaultCmd.action(async (options) => {
      const name: string = options.name
      try {
        const keyService = createKeyService()
        if (!(await keyService.hasKey(name))) {
          console.error(chalk.red(`Error: Wallet '${name}' not found.`))
          process.exit(1)
        }

        configService.setDefaultWallet(name)
        console.log(chalk.green(`  Default wallet set to '${name}'.`))
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })

  const renameCmd = wallet
    .command('rename')
    .description('Rename a wallet')
    .requiredOption('--name <name>', 'Current wallet name')
    .requiredOption('--new-name <name>', 'New wallet name')

  configureHelp(renameCmd, {
    params: [
      { flags: '--name <name>', description: 'Current wallet name', required: true },
      { flags: '--new-name <name>', description: 'New wallet name', required: true },
    ],
  })

  renameCmd.action(async (options) => {
      const oldName: string = options.name
      const newName: string = options.newName
      try {
        const keyService = createKeyService()

        if (!(await keyService.hasKey(oldName))) {
          console.error(chalk.red(`Error: Wallet '${oldName}' not found.`))
          process.exit(1)
        }

        if (await keyService.hasKey(newName)) {
          console.error(chalk.red(`Error: Wallet '${newName}' already exists.`))
          process.exit(1)
        }

        try {
          if (await daemonClient.isRunning()) {
            await daemonClient.lockWallet(oldName)
          }
        } catch { /* */ }

        const { rename } = await import('node:fs/promises')
        const { getWalletDir } = await import('../config/constants.js')
        await rename(getWalletDir(oldName), getWalletDir(newName))

        if (configService.getDefaultWallet() === oldName) {
          configService.setDefaultWallet(newName)
        }

        console.log(chalk.green(`  Wallet '${oldName}' renamed to '${newName}'.`))
      } catch (error) {
        handleError(error, program.opts().verbose)
      }
    })
}
