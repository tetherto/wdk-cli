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
import { configService } from '../services/config-service.js'
import { SESSION_TTL_MINUTES } from '../config/constants.js'
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

function spawnDaemon(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', getDaemonScript()], {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true,
    })

    let stderr = ''
    child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    const timeout = setTimeout(() => {
      child.stderr!.destroy()
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

async function ensureDaemonRunning(): Promise<void> {
  if (await daemonClient.isRunning()) return

  await spawnDaemon()

  let retries = 5
  while (retries > 0) {
    if (await daemonClient.isRunning()) {
      try {
        await daemonClient.status()
        return
      } catch { /* not ready yet */ }
    }
    await new Promise((r) => setTimeout(r, 500))
    retries--
  }
  throw new Error('Failed to start wallet daemon')
}

export function registerWalletCommand(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Manage wallet keys and sessions')

  wallet
    .command('create')
    .description('Generate a new BIP-39 seed phrase')
    .requiredOption('--name <name>', 'Wallet name')
    .option('--words <count>', 'Word count: 12 or 24', '12')
    .action(async (options) => {
      const name: string = options.name
      try {
        const wordCount = parseInt(options.words, 10) as 12 | 24
        if (wordCount !== 12 && wordCount !== 24) {
          console.error(chalk.red('Error: --words must be 12 or 24'))
          process.exit(1)
        }

        const keyService = createKeyService()

        if (await keyService.hasKey(name)) {
          const overwrite = await promptConfirm(
            `Wallet '${name}' already exists. Overwrite it?`,
          )
          if (!overwrite) {
            console.log('Cancelled.')
            return
          }
        }

        const seedPhrase = keyService.generate(wordCount)

        const isJson = program.opts().json
        if (isJson) {
          console.log(JSON.stringify({ seedPhrase, wordCount, wallet: name }))
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
          const password = await promptPassword('Create a password for this wallet:')
          const confirmPw = await promptPassword('Confirm password:')

          if (password !== confirmPw) {
            console.error(chalk.red('Error: Passwords do not match.'))
            process.exit(1)
          }

          if (isJson) {
            await keyService.store(seedPhrase, password, name)
          } else {
            const spinner = ora('Encrypting and storing seed phrase...').start()
            await keyService.store(seedPhrase, password, name)
            spinner.succeed(`Seed phrase encrypted and stored as '${name}'.`)
          }

          if (!configService.getDefaultWallet()) {
            configService.setDefaultWallet(name)
            if (!isJson) console.log(chalk.dim(`  Set as default wallet.`))
          }
        }
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('import')
    .description('Import an existing BIP-39 seed phrase')
    .requiredOption('--name <name>', 'Wallet name')
    .action(async (options) => {
      const name: string = options.name
      try {
        const keyService = createKeyService()

        if (await keyService.hasKey(name)) {
          const overwrite = await promptConfirm(
            `Wallet '${name}' already exists. Overwrite it?`,
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

        const password = await promptPassword('Create a password for this wallet:')
        const confirmPw = await promptPassword('Confirm password:')

        if (password !== confirmPw) {
          console.error(chalk.red('Error: Passwords do not match.'))
          process.exit(1)
        }

        const isJson = program.opts().json
        if (isJson) {
          await keyService.store(seedPhrase, password, name)
        } else {
          const spinner = ora('Encrypting and storing seed phrase...').start()
          await keyService.store(seedPhrase, password, name)
          spinner.succeed(`Seed phrase imported and encrypted as '${name}'.`)
        }

        // Auto-set as default if first wallet
        if (!configService.getDefaultWallet()) {
          configService.setDefaultWallet(name)
          if (!isJson) console.log(chalk.dim(`  Set as default wallet.`))
        }
      } catch (error) {
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('export')
    .description('Export seed phrase (decrypt and display)')
    .requiredOption('--name <name>', 'Wallet name')
    .action(async (options) => {
      const name: string = options.name
      try {
        const keyService = createKeyService()

        if (!(await keyService.hasKey(name))) {
          throw new KeyNotFoundError()
        }

        const password = await promptPassword('Enter password to decrypt seed phrase:')
        const seedPhrase = await keyService.unlock(password, name)

        if (program.opts().json) {
          console.log(JSON.stringify({ seedPhrase, wallet: name }))
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

        if (program.opts().json) {
          console.log(JSON.stringify({
            wallets: wallets.map((name) => {
              const unlocked = unlockedWallets.find((w) => w.name === name)
              return {
                name,
                unlocked: !!unlocked,
                default: name === defaultWallet,
                ...(unlocked ? { ttlMs: unlocked.ttlMs, ttlRemaining: unlocked.ttlRemaining } : {}),
              }
            }),
          }))
          return
        }

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
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('delete')
    .description('Delete a wallet')
    .requiredOption('--name <name>', 'Wallet name')
    .action(async (options) => {
      const name: string = options.name
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
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('unlock')
    .description('Unlock a wallet (starts background daemon if needed)')
    .requiredOption('--name <name>', 'Wallet name')
    .option('--ttl <minutes>', 'Session duration in minutes (0 = unlimited)', String(SESSION_TTL_MINUTES))
    .action(async (options) => {
      const name: string = options.name
      try {
        const keyService = createKeyService()

        if (!(await keyService.hasKey(name))) {
          throw new KeyNotFoundError()
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

        const password = await promptPassword(`Enter password to unlock '${name}':`)

        await keyService.unlock(password, name)

        const spinner = ora(`Unlocking '${name}'...`).start()
        await ensureDaemonRunning()
        await daemonClient.unlockWallet(name, password, ttl)

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
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('lock')
    .description('Lock a wallet')
    .option('--name <name>', 'Wallet name')
    .option('--all', 'Lock all wallets')
    .action(async (options) => {
      const name: string | undefined = options.name
      try {
        if (options.all) {
          if (await daemonClient.isRunning()) {
            await daemonClient.lock()
          }

          const { sessionService } = await import('../services/session-service.js')
          await sessionService.destroy()

          console.log()
          console.log(chalk.green('  All wallets locked'))
          console.log()
          return
        }

        if (!name) {
          console.error(chalk.red('Error: --name <name> or --all is required'))
          process.exit(1)
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
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('default')
    .description('Set the default wallet')
    .requiredOption('--name <name>', 'Wallet name')
    .action(async (options) => {
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
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })

  wallet
    .command('rename')
    .description('Rename a wallet')
    .requiredOption('--name <name>', 'Current wallet name')
    .requiredOption('--new <name>', 'New wallet name')
    .action(async (options) => {
      const oldName: string = options.name
      const newName: string = options.new
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
        handleError(error, program.opts().verbose, program.opts().json)
      }
    })
}
