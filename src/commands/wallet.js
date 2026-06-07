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
import { rename } from 'node:fs/promises'
import { KeyService } from '../services/key-service.js'
import { WalletKeyring } from '../security/keyring.js'
import { daemonClient } from '../daemon/client.js'
import { configService } from '../services/config-service.js'
import { SESSION_TTL_MINUTES, getWalletDir } from '../config/constants.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { promptPassphrase, promptSeedPhrase } from '../ui/prompts.js'
import { requirePassphraseConfirmation } from '../ui/auth.js'
import { configureHelp } from '../ui/help.js'
import { createTable } from '../ui/tables.js'
import { nonNegativeInt } from '../ui/parsers.js'

/** @typedef {import('commander').Command} Command */

/**
 * Creates a new KeyService instance backed by a WalletKeyring.
 *
 * @returns {KeyService} A ready KeyService instance.
 */
function createKeyService () {
  return new KeyService(new WalletKeyring())
}

/**
 * Registers the `wallet` subcommand tree (create, import, export, list, delete, unlock, lock, default, rename) on the root program.
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerWalletCommand (program) {
  const wallet = program.command('wallet').description('Manage wallets, keys, and sessions')

  configureHelp(wallet, {})

  function isJson () {
    return !!program.opts().json
  }

  const create = wallet
    .command('create')
    .description('Create a new wallet with a generated seed phrase')
    .requiredOption('--name <name>', 'Wallet name')
    .option('--words <count>', 'Word count: 12 or 24', '12')

  configureHelp(create, {
    params: [{ flags: '--name <name>', description: 'Wallet name', required: true }],
    options: [{ flags: '--words <count>', description: 'Word count: 12 or 24 (default: 12)' }]
  })

  create.action(async (options) => {
    const name = options.name
    try {
      if (options.words !== '12' && options.words !== '24') {
        throw new WdkCliError('--words must be 12 or 24', ErrorCode.INVALID_ARGUMENT)
      }
      const wordCount = options.words === '24' ? 24 : 12

      const keyService = createKeyService()

      if (await keyService.hasKey(name)) {
        throw new WdkCliError(`Wallet '${name}' already exists.`, ErrorCode.WALLET_EXISTS)
      }

      const seedPhrase = keyService.generate(wordCount)

      if (!isJson()) {
        console.log(
          chalk.dim(
            'Enter a passphrase to encrypt your seed phrase. Remember the passphrase to unlock this wallet in the future.'
          )
        )
        console.log()
      }

      const passphrase = await promptPassphrase('Passphrase (empty for none):')
      if (passphrase === '' && !isJson()) {
        console.log()
        console.log(
          chalk.bold.yellow(
            'WARNING: Empty passphrase. Seed phrase will be stored unencrypted, anyone with access to this machine can read it.'
          )
        )
        console.log()
      }
      const confirmPw = await promptPassphrase('Confirm passphrase:')
      if (passphrase !== confirmPw) {
        throw new WdkCliError('Passphrases do not match.', ErrorCode.PASSPHRASE_MISMATCH)
      }
      const spinner = isJson() ? null : ora('Encrypting and storing seed phrase...').start()
      await keyService.store(seedPhrase, passphrase, name)
      spinner?.succeed(`Seed phrase encrypted and stored as '${name}'.`)

      let setAsDefault = false
      if (!configService.getDefaultWallet()) {
        configService.setDefaultWallet(name)
        setAsDefault = true
      }

      if (isJson()) {
        console.log(JSON.stringify({ wallet: name, seedPhrase, setAsDefault }))
      } else {
        console.log()
        console.log(
          chalk.bold.yellow('WARNING: Store this seed phrase safely. Do not share it with anyone.')
        )
        console.log()
        console.log(chalk.bold('Seed phrase:'))
        console.log()
        console.log(`  ${seedPhrase}`)
        console.log()
        if (setAsDefault) console.log(chalk.dim('  Set as default wallet.'))
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })

  const importCmd = wallet
    .command('import')
    .description('Import a wallet from an existing seed phrase')
    .requiredOption('--name <name>', 'Wallet name')

  configureHelp(importCmd, {
    params: [{ flags: '--name <name>', description: 'Wallet name', required: true }]
  })

  importCmd.action(async (options) => {
    const name = options.name
    try {
      const keyService = createKeyService()

      if (await keyService.hasKey(name)) {
        throw new WdkCliError(`Wallet '${name}' already exists.`, ErrorCode.WALLET_EXISTS)
      }

      if (!isJson()) console.log(chalk.dim('Enter your BIP-39 seed phrase (12 or 24 words).'))
      const seedPhrase = (await promptSeedPhrase()).trim()

      if (!keyService.validate(seedPhrase)) {
        throw new WdkCliError(
          'Invalid seed phrase. Must be 12 or 24 valid BIP-39 words.',
          ErrorCode.INVALID_ARGUMENT
        )
      }

      if (!isJson()) {
        console.log(
          chalk.dim(
            'Enter a passphrase to encrypt your seed phrase. Remember the passphrase to unlock this wallet in the future.'
          )
        )
        console.log()
      }

      const passphrase = await promptPassphrase('Passphrase (empty for none):')
      if (passphrase === '' && !isJson()) {
        console.log()
        console.log(
          chalk.bold.yellow(
            'WARNING: Empty passphrase. Seed phrase will be stored unencrypted, anyone with access to this machine can read it.'
          )
        )
        console.log()
      }
      const confirmPw = await promptPassphrase('Confirm passphrase:')
      if (passphrase !== confirmPw) {
        throw new WdkCliError('Passphrases do not match.', ErrorCode.PASSPHRASE_MISMATCH)
      }

      const spinner = isJson() ? null : ora('Encrypting and storing seed phrase...').start()
      await keyService.store(seedPhrase, passphrase, name)
      spinner?.succeed(`Seed phrase imported and encrypted as '${name}'.`)

      let setAsDefault = false
      if (!configService.getDefaultWallet()) {
        configService.setDefaultWallet(name)
        setAsDefault = true
      }

      if (isJson()) {
        console.log(JSON.stringify({ wallet: name, imported: true, setAsDefault }))
      } else {
        if (setAsDefault) console.log(chalk.dim('  Set as default wallet.'))
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })

  const exportCmd = wallet
    .command('export')
    .description('Export seed phrase (decrypt and display)')
    .requiredOption('--name <name>', 'Wallet name')

  configureHelp(exportCmd, {
    params: [{ flags: '--name <name>', description: 'Wallet name', required: true }]
  })

  exportCmd.action(async (options) => {
    const name = options.name
    try {
      const keyService = createKeyService()

      if (!(await keyService.hasKey(name))) {
        throw new WdkCliError(`Wallet '${name}' not found.`, ErrorCode.KEY_NOT_FOUND)
      }

      const passphrase = await promptPassphrase(`Enter passphrase of '${name}' wallet:`)
      const seedPhrase = await keyService.unlock(passphrase, name)

      if (isJson()) {
        console.log(JSON.stringify({ wallet: name, seedPhrase }))
      } else {
        console.log()
        console.log(chalk.bold.yellow('WARNING: Do not share your seed phrase with anyone!'))
        console.log()
        console.log(chalk.bold('Seed phrase:'))
        console.log()
        console.log(`  ${seedPhrase}`)
        console.log()
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })

  const listCmd = wallet.command('list').description('List all wallets')

  configureHelp(listCmd, {})

  listCmd.action(async () => {
    try {
      const keyService = createKeyService()

      const wallets = await keyService.list()

      let unlockedWallets = []
      try {
        if (await daemonClient.isRunning()) {
          unlockedWallets = await daemonClient.listWallets()
        }
      } catch {
        /* daemon not running */
      }

      const defaultWallet = configService.getDefaultWallet()

      if (isJson()) {
        const result = wallets.map((name) => {
          const unlocked = unlockedWallets.find((w) => w.name === name)
          return {
            name,
            default: name === defaultWallet,
            unlocked: !!unlocked,
            ...(unlocked ? { ttlMs: unlocked.ttlMs, ttlRemaining: unlocked.ttlRemaining } : {})
          }
        })
        console.log(JSON.stringify({ wallets: result, count: result.length }))
        return
      }

      if (wallets.length === 0) {
        console.log(
          chalk.dim('  No wallets found. Run `wdk wallet create --name <name>` to get started.')
        )
        return
      }

      console.log()
      const table = createTable(['Name', 'Default', 'Status', 'TTL Remaining'])
      for (const name of wallets) {
        const unlocked = unlockedWallets.find((w) => w.name === name)
        let ttlCell
        if (!unlocked) {
          ttlCell = chalk.dim('-')
        } else if (unlocked.ttlMs === 0) {
          ttlCell = chalk.dim('unlimited')
        } else {
          ttlCell = `${Math.ceil(unlocked.ttlRemaining / 60000)} min`
        }
        table.push([
          chalk.bold(name),
          name === defaultWallet ? chalk.green('✓') : '',
          unlocked ? chalk.green('unlocked') : chalk.dim('locked'),
          ttlCell
        ])
      }
      console.log(table.toString())
      console.log(chalk.dim(`\n  ${wallets.length} wallet${wallets.length === 1 ? '' : 's'}`))
      console.log()
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })

  const deleteCmd = wallet
    .command('delete')
    .description('Delete a wallet')
    .requiredOption('--name <name>', 'Wallet name')

  configureHelp(deleteCmd, {
    params: [{ flags: '--name <name>', description: 'Wallet name', required: true }]
  })

  deleteCmd.action(async (options) => {
    const name = options.name
    try {
      const keyService = createKeyService()

      if (!(await keyService.hasKey(name))) {
        throw new WdkCliError(`Wallet '${name}' not found.`, ErrorCode.KEY_NOT_FOUND)
      }

      const passphrase = await promptPassphrase(
        `Enter passphrase of '${name}' wallet to confirm deletion:`
      )
      await keyService.unlock(passphrase, name)

      try {
        if (await daemonClient.isRunning()) {
          await daemonClient.lockWallet(name)
        }
      } catch {
        /* */
      }

      await keyService.destroy(name)

      let newDefault
      if (configService.getDefaultWallet() === name) {
        const remaining = await keyService.list()
        if (remaining.length > 0) {
          configService.setDefaultWallet(remaining[0])
          newDefault = remaining[0]
        } else {
          configService.setDefaultWallet('')
        }
      }

      if (isJson()) {
        console.log(
          JSON.stringify({ wallet: name, deleted: true, ...(newDefault ? { newDefault } : {}) })
        )
      } else {
        console.log(chalk.green(`  Wallet '${name}' deleted.`))
        if (newDefault) console.log(chalk.dim(`  Default wallet changed to '${newDefault}'.`))
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })

  const unlockCmd = wallet
    .command('unlock')
    .description('Unlock a wallet (starts background daemon if needed)')
    .requiredOption('--name <name>', 'Wallet name')
    .option(
      '--ttl <minutes>',
      'Session duration in minutes (0 = unlimited)',
      nonNegativeInt,
      SESSION_TTL_MINUTES
    )

  configureHelp(unlockCmd, {
    params: [{ flags: '--name <name>', description: 'Wallet name', required: true }],
    options: [
      {
        flags: '--ttl <minutes>',
        description: `Session duration in minutes, 0 = unlimited (default: ${SESSION_TTL_MINUTES})`
      }
    ]
  })

  unlockCmd.action(async (options) => {
    const name = options.name
    try {
      const keyService = createKeyService()

      if (!(await keyService.hasKey(name))) {
        throw new WdkCliError(`Wallet '${name}' not found.`, ErrorCode.KEY_NOT_FOUND)
      }

      const ttl = options.ttl

      const passphrase = await promptPassphrase(`Enter passphrase of '${name}' wallet to unlock:`)
      await keyService.unlock(passphrase, name)

      let alreadyUnlocked = false
      if (await daemonClient.isRunning()) {
        try {
          const status = await daemonClient.status()
          alreadyUnlocked = !!status.wallets.find((w) => w.name === name)
        } catch {
          /* daemon unreachable */
        }
      }

      const spinner = isJson() ? null : ora(`Unlocking '${name}'...`).start()
      await daemonClient.ensureRunning()
      await daemonClient.unlockWallet(name, passphrase, ttl)

      spinner?.succeed(alreadyUnlocked ? `Wallet '${name}' timer reset` : `Wallet '${name}' unlocked`)

      if (isJson()) {
        console.log(JSON.stringify({ wallet: name, unlocked: true, alreadyUnlocked, ttl }))
      } else {
        console.log()
        if (alreadyUnlocked) {
          if (ttl === 0) {
            console.log(chalk.dim('  Session timer reset (no expiration)'))
          } else {
            console.log(chalk.dim(`  Session timer reset to ${ttl} minutes`))
          }
        } else {
          if (ttl === 0) {
            console.log(chalk.dim('  Session will not expire'))
          } else {
            console.log(chalk.dim(`  Session locks after ${ttl} minutes`))
          }
        }
        console.log(chalk.dim(`  Run \`wdk wallet lock --name ${name}\` to end session`))
        console.log()
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })

  const lockCmd = wallet
    .command('lock')
    .description('Lock one wallet (--name) or every wallet (--all)')
    .option('--name <name>', 'Wallet name')
    .option('--all', 'Lock every wallet')

  configureHelp(lockCmd, {
    params: [
      { flags: '--name <name>', description: 'Wallet name (required, unless using --all)' },
      { flags: '--all', description: 'Lock every wallet' }
    ]
  })

  lockCmd.action(async (options) => {
    const name = options.name
    try {
      if (!name && !options.all) {
        throw new WdkCliError(
          'Provide --name <name> or --all.',
          ErrorCode.INVALID_ARGUMENT
        )
      }
      if (options.all) {
        if (await daemonClient.isRunning()) {
          await daemonClient.lock()
        }

        if (isJson()) {
          console.log(JSON.stringify({ locked: true, all: true }))
        } else {
          console.log()
          console.log(chalk.green('  All wallets locked'))
          console.log()
        }
        return
      }

      const keyService = createKeyService()
      if (!(await keyService.hasKey(name))) {
        throw new WdkCliError(`Wallet '${name}' not found.`, ErrorCode.KEY_NOT_FOUND)
      }

      if (!(await daemonClient.isRunning())) {
        if (isJson()) {
          console.log(JSON.stringify({ wallet: name, locked: true, alreadyLocked: true }))
        } else {
          console.log(chalk.dim(`  Wallet '${name}' is already locked.`))
        }
        return
      }

      await daemonClient.lockWallet(name)

      if (isJson()) {
        console.log(JSON.stringify({ wallet: name, locked: true }))
      } else {
        console.log()
        console.log(chalk.green(`  Wallet '${name}' locked`))
        console.log()
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })

  const defaultCmd = wallet
    .command('default')
    .description('Set the default wallet')
    .requiredOption('--name <name>', 'Wallet name')

  configureHelp(defaultCmd, {
    params: [{ flags: '--name <name>', description: 'Wallet name', required: true }]
  })

  defaultCmd.action(async (options) => {
    const name = options.name
    try {
      const keyService = createKeyService()
      if (!(await keyService.hasKey(name))) {
        throw new WdkCliError(`Wallet '${name}' not found.`, ErrorCode.KEY_NOT_FOUND)
      }

      if (configService.getDefaultWallet()) {
        await requirePassphraseConfirmation()
      } else {
        // fallback case: No default yet — confirm with the target wallet's own passphrase
        const passphrase = await promptPassphrase(
          `Enter passphrase of '${name}' wallet to confirm:`
        )
        await keyService.unlock(passphrase, name)
      }

      configService.setDefaultWallet(name)
      if (isJson()) {
        console.log(JSON.stringify({ wallet: name, default: true }))
      } else {
        console.log(chalk.green(`  Default wallet set to '${name}'.`))
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
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
      { flags: '--new-name <name>', description: 'New wallet name', required: true }
    ]
  })

  renameCmd.action(async (options) => {
    const oldName = options.name
    const newName = options.newName
    try {
      const keyService = createKeyService()

      if (!(await keyService.hasKey(oldName))) {
        throw new WdkCliError(`Wallet '${oldName}' not found.`, ErrorCode.KEY_NOT_FOUND)
      }

      if (await keyService.hasKey(newName)) {
        throw new WdkCliError(`Wallet '${newName}' already exists.`, ErrorCode.WALLET_EXISTS)
      }

      const passphrase = await promptPassphrase(
        `Enter passphrase of '${oldName}' wallet to confirm rename:`
      )
      await keyService.unlock(passphrase, oldName)

      try {
        if (await daemonClient.isRunning()) {
          await daemonClient.lockWallet(oldName)
        }
      } catch {
        /* */
      }

      await rename(getWalletDir(oldName), getWalletDir(newName))

      if (configService.getDefaultWallet() === oldName) {
        configService.setDefaultWallet(newName)
      }

      if (isJson()) {
        console.log(JSON.stringify({ oldName, newName, renamed: true }))
      } else {
        console.log(chalk.green(`  Wallet '${oldName}' renamed to '${newName}'.`))
      }
    } catch (error) {
      handleError(error, program.opts().verbose, isJson())
    }
  })
}
