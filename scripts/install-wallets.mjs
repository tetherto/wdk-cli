#!/usr/bin/env node
/**
 * Reads wdk-config.json and installs all wallet modules listed in it.
 * Run: node scripts/install-wallets.mjs
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const walletsPath = join(__dirname, '..', 'wdk-config.json')
const wallets = JSON.parse(readFileSync(walletsPath, 'utf8'))

const modules = [...new Set(Object.values(wallets.networks).map(w => w.module))]

if (modules.length === 0) {
  console.log('No wallet modules to install.')
  process.exit(0)
}

console.log(`Installing ${modules.length} wallet modules from wdk-config.json...`)
console.log(modules.map(m => `  - ${m}`).join('\n'))

try {
  execSync(`npm install --no-save ${modules.join(' ')}`, {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  })
  console.log('\nAll wallet modules installed successfully.')
} catch (err) {
  console.error('\nFailed to install wallet modules.')
  process.exit(1)
}
