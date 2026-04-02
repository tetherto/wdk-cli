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
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import ora from 'ora'
import { KeyService } from '../services/key-service.js'
import { WalletKeyring } from '../security/keyring.js'
import { daemonClient } from '../daemon/client.js'
import { DEFAULT_WALLET, SESSION_TTL_MINUTES } from '../config/constants.js'
import { KeyNotFoundError, handleError } from '../errors/index.js'
import { promptPassword, promptSeedPhrase, promptConfirm } from '../ui/prompts.js'

function createKeyService(): KeyService {
  return new KeyService(new WalletKeyring())
}

function getDaemonScript(): string {
  const thisFile = fileURLToPath(import.meta.url)
  let dir = dirname(thisFile)
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'bin', 'wdk-daemon.mjs')
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }
  throw new Error('Cannot find wdk-daemon.mjs')
}

function spawnDaemon(password: string, ttl: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [getDaemonScript()], {
      env: { ...process.env, WDK_DAEMON_TTL: String(ttl) },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })

    child.stdin!.write(password)
    child.stdin!.end()

    let stderr = ''
    child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    const timeout = setTimeout(() => {
      child.unref()
      resolve()
    }, 2000)

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to start daemon: ${err.message}`))
    })

    child.on('exit', (code) => {
      clearTimeout(timeout)
      if (code !== 0 && code !== null) {
        reject(new Error(`Daemon exited with code ${code}: ${stderr.trim()}`))
      }
    })
  })
}

export function registerWalletCommand(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Manage wallet keys and sessions')

  wallet
    .command('create')
    .description('Generate a new BIP-39 seed phrase')
    .option('--words <count>', 'Word count: 12 or 24', '12')
    .option('--name <name>', 'Wallet name', DEFAULT_WALLET)
    .action(async (options) => {
      try {
        const wordCount = parseInt(options.words, 10) as 12 | 24
        if (wordCount !== 12 && wordCount !== 24) {
          console.error(chalk.red('Error: --words must be 12 or 24'))
          process.exit(1)
        }

        const walletName = options.name as string
        const keyService = createKeyService()

        if (await keyService.hasKey(walletName)) {
          const overwrite = await promptConfirm(
            `Wallet '${walletName}' already exists. Overwrite it?`,
          )
          if (!overwrite) {
            console.log('Cancelled.')
            return
          }
        }

        const seedPhrase = keyService.generate(wordCount)

        const isJson = program.opts().json
        if (isJson) {
          console.log(JSON.stringify({ seedPhrase, wordCount, wallet: walletName }))
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
          let password: string
          const hasExisting = await keyService.hasAnyKey()

          if (hasExisting) {
            password = await promptPassword('Enter your wallet password:')
            const existingWallets = await keyService.list()
            const testWallet = existingWallets[0]
            try {
              await keyService.unlock(password, testWallet)
            } catch {
              console.error(chalk.red('Error: Incorrect password.'))
              process.exit(1)
            }
          } else {
            password = await promptPassword('Create a password to encrypt your seed phrase:')
            const confirmPw = await promptPassword('Confirm password:')

            if (password !== confirmPw) {
              console.error(chalk.red('Error: Passwords do not match.'))
              process.exit(1)
            }
          }

          const spinner = ora('Encrypting and storing seed phrase...').start()
          await keyService.store(seedPhrase, password, walletName)
          spinner.succeed(`Seed phrase encrypted and stored as '${walletName}'.`)
        }
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('import')
    .description('Import an existing BIP-39 seed phrase')
    .option('--name <name>', 'Wallet name', DEFAULT_WALLET)
    .action(async (options) => {
      try {
        const walletName = options.name as string
        const keyService = createKeyService()

        if (await keyService.hasKey(walletName)) {
          const overwrite = await promptConfirm(
            `Wallet '${walletName}' already exists. Overwrite it?`,
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

        let password: string
        const hasExisting = await keyService.hasAnyKey()

        if (hasExisting) {
          password = await promptPassword('Enter your wallet password:')
          const existingWallets = await keyService.list()
          const testWallet = existingWallets[0]
          try {
            await keyService.unlock(password, testWallet)
          } catch {
            console.error(chalk.red('Error: Incorrect password.'))
            process.exit(1)
          }
        } else {
          password = await promptPassword('Create a password to encrypt your seed phrase:')
          const confirmPw = await promptPassword('Confirm password:')

          if (password !== confirmPw) {
            console.error(chalk.red('Error: Passwords do not match.'))
            process.exit(1)
          }
        }

        const spinner = ora('Encrypting and storing seed phrase...').start()
        await keyService.store(seedPhrase, password, walletName)
        spinner.succeed(`Seed phrase imported and encrypted as '${walletName}'.`)
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('export')
    .description('Export seed phrase (decrypt and display)')
    .option('--name <name>', 'Wallet name', DEFAULT_WALLET)
    .action(async (options) => {
      try {
        const walletName = options.name as string
        const keyService = createKeyService()

        if (!(await keyService.hasKey(walletName))) {
          throw new KeyNotFoundError()
        }

        const password = await promptPassword('Enter password to decrypt seed phrase:')
        const seedPhrase = await keyService.unlock(password, walletName)

        if (program.opts().json) {
          console.log(JSON.stringify({ seedPhrase, wallet: walletName }))
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
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('list')
    .description('List all wallets')
    .action(async () => {
      try {
        const keyService = createKeyService()
        const wallets = await keyService.list()

        if (wallets.length === 0) {
          console.log(chalk.dim('  No wallets found. Run `wdk wallet create` to get started.'))
          return
        }

        let unlockedWallets: string[] = []
        try {
          if (await daemonClient.isRunning()) {
            unlockedWallets = await daemonClient.listWallets()
          }
        } catch { /* daemon not running */ }

        if (program.opts().json) {
          console.log(JSON.stringify({ wallets: wallets.map((name) => ({ name, unlocked: unlockedWallets.includes(name) })) }))
          return
        }

        console.log()
        console.log(chalk.bold('Wallets:'))
        console.log()
        for (const name of wallets) {
          const isDefault = name === DEFAULT_WALLET ? chalk.dim(' (default)') : ''
          const isUnlocked = unlockedWallets.includes(name) ? chalk.green(' ✓') : chalk.dim(' locked')
          console.log(`  ${chalk.green('•')} ${name}${isDefault}${isUnlocked}`)
        }
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('delete <name>')
    .description('Delete a wallet')
    .action(async (name: string) => {
      try {
        const keyService = createKeyService()

        if (!(await keyService.hasKey(name))) {
          console.error(chalk.red(`Error: Wallet '${name}' not found.`))
          process.exit(1)
        }

        const password = await promptPassword('Enter wallet password to confirm deletion:')
        await keyService.unlock(password, name)

        const confirm = await promptConfirm(`Delete wallet '${name}'? This cannot be undone.`)
        if (!confirm) {
          console.log('Cancelled.')
          return
        }

        await keyService.destroy(name)
        console.log(chalk.green(`  Wallet '${name}' deleted.`))
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('unlock')
    .description('Unlock all wallets (starts background daemon)')
    .option('--ttl <minutes>', 'Session duration in minutes (0 = unlimited)', String(SESSION_TTL_MINUTES))
    .action(async (options) => {
      try {
        const keyService = createKeyService()
        if (!(await keyService.hasAnyKey())) {
          throw new KeyNotFoundError()
        }

        if (await daemonClient.isRunning()) {
          try {
            const status = await daemonClient.status()
            const walletList = status.wallets.join(', ')
            if (status.ttlMs === 0) {
              console.log(chalk.yellow(`  Wallet already unlocked: ${walletList} (unlimited session)`))
            } else {
              const mins = Math.ceil(status.ttlMs / 60000)
              console.log(chalk.yellow(`  Wallet already unlocked: ${walletList} (${mins} min timeout)`))
            }
            return
          } catch { /* daemon unreachable, continue */ }
        }

        const password = await promptPassword('Enter password to unlock wallet:')

        await keyService.migrateLegacy(password)

        const spinner = ora('Unlocking wallets...').start()
        const seeds = await keyService.unlockAll(password)
        const walletNames = [...seeds.keys()]
        spinner.text = 'Starting daemon...'

        const ttl = parseInt(options.ttl, 10)
        await spawnDaemon(password, ttl)

        let retries = 5
        while (retries > 0) {
          if (await daemonClient.isRunning()) {
            try {
              await daemonClient.status()
              break
            } catch { /* not ready yet */ }
          }
          await new Promise((r) => setTimeout(r, 500))
          retries--
        }

        if (retries === 0) {
          spinner.fail('Failed to start wallet daemon')
          return
        }

        spinner.succeed(`Wallet${walletNames.length > 1 ? 's' : ''} unlocked: ${walletNames.join(', ')}`)

        console.log()
        if (ttl === 0) {
          console.log(chalk.dim('  Session will not expire'))
        } else {
          console.log(chalk.dim(`  Session expires after ${ttl} minutes of inactivity`))
        }
        console.log(chalk.dim('  Run `wdk wallet lock` to end session'))
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('lock')
    .description('Lock all wallets and stop daemon')
    .action(async () => {
      try {
        if (await daemonClient.isRunning()) {
          await daemonClient.lock()
        }

        const { sessionService } = await import('../services/session-service.js')
        await sessionService.destroy()

        console.log()
        console.log(chalk.green('  Wallet locked'))
        console.log()
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })
}
