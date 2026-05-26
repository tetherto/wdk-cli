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

/**
 * Integration tests for CLI output.
 * Creates a temp wallet, tests all commands, then cleans up.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PASSPHRASE = 'test-pass-123'
const WALLET_NAME = 'test-wallet'
const WALLET_NAME_2 = 'test-wallet-2'

let tempDir

function makeEnv(passphrase) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: tempDir,
    WDK_PASSPHRASE: passphrase,
  }
}

function wdk(args, passphrase = PASSPHRASE) {
  return execSync(`node bin/wdk.mjs ${args}`, {
    encoding: 'utf8',
    timeout: 30000,
    env: makeEnv(passphrase),
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function wdkJson(args, passphrase = PASSPHRASE) {
  const out = wdk(`--json ${args}`, passphrase)
  return JSON.parse(out)
}

function parseJsonLine(output) {
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try { return JSON.parse(trimmed) } catch { /* keep trying */ }
  }
  throw new Error(`No parseable JSON line found in output:\n${output}`)
}

function wdkJsonSafe(args, passphrase = PASSPHRASE) {
  try {
    return wdkJson(args, passphrase)
  } catch (e) {
    const output = (e.stdout || e.stderr || '').toString().trim()
    return parseJsonLine(output)
  }
}

before(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'wdk-test-'))
})

after(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
})

describe('wallet create', () => {
  it('creates a wallet and returns JSON with seed phrase', () => {
    const result = wdkJson(`wallet create --name ${WALLET_NAME} --words 12`)
    assert.equal(result.wallet, WALLET_NAME)
    assert.equal(result.seedPhrase.split(' ').length, 12)
    assert.equal(result.setAsDefault, true)
  })

  it('creates a second wallet (not default)', () => {
    const result = wdkJson(`wallet create --name ${WALLET_NAME_2} --words 24`)
    assert.equal(result.wallet, WALLET_NAME_2)
    assert.equal(result.seedPhrase.split(' ').length, 24)
    assert.equal(result.setAsDefault, false)
  })

  it('returns error for duplicate wallet name', () => {
    const result = wdkJsonSafe(`wallet create --name ${WALLET_NAME} --words 12`)
    assert.ok(result.error.includes('already exists'))
    assert.equal(result.code, 'WALLET_EXISTS')
  })

  it('creates wallet without (human output)', () => {
    const out = wdk('wallet create --name human-test --words 12')
    assert.ok(out.includes('Seed phrase'))
  })
})

describe('wallet list', () => {
  it('lists all wallets with status', () => {
    const result = wdkJson('wallet list')
    assert.ok(result.count >= 3)
    assert.ok(result.wallets.some((w) => w.name === WALLET_NAME))
    assert.ok(result.wallets.some((w) => w.name === WALLET_NAME_2))
  })

  it('marks the first wallet as default', () => {
    const result = wdkJson('wallet list')
    const defaultWallet = result.wallets.find((w) => w.default)
    assert.equal(defaultWallet?.name, WALLET_NAME)
  })

  it('shows all wallets as locked initially', () => {
    const result = wdkJson('wallet list')
    for (const w of result.wallets) {
      assert.equal(w.unlocked, false)
    }
  })

  it('lists wallets without (human output)', () => {
    const out = wdk('wallet list')
    assert.ok(out.includes(WALLET_NAME))
    assert.ok(out.includes('locked'))
  })
})

describe('wallet default', () => {
  it('sets default wallet', () => {
    const result = wdkJson(`wallet default --name ${WALLET_NAME_2}`)
    assert.equal(result.wallet, WALLET_NAME_2)
    assert.equal(result.default, true)
  })

  it('verifies default changed in list', () => {
    const result = wdkJson('wallet list')
    const defaultWallet = result.wallets.find((w) => w.default)
    assert.equal(defaultWallet.name, WALLET_NAME_2)
  })

  it('restores default back', () => {
    wdkJson(`wallet default --name ${WALLET_NAME}`)
    const result = wdkJson('wallet list')
    assert.equal(result.wallets.find((w) => w.default).name, WALLET_NAME)
  })

  it('returns error for nonexistent wallet', () => {
    const result = wdkJsonSafe('wallet default --name nonexistent')
    assert.ok(result.error.includes('not found'))
    assert.equal(result.code, 'KEY_NOT_FOUND')
  })

  it('sets default without (human output)', () => {
    const out = wdk(`wallet default --name ${WALLET_NAME}`)
    assert.ok(out.includes('Default wallet set'))
  })
})

describe('wallet export', () => {
  it('exports seed phrase as JSON', () => {
    const result = wdkJson(`wallet export --name ${WALLET_NAME}`)
    assert.equal(result.wallet, WALLET_NAME)
    assert.equal(result.seedPhrase.split(' ').length, 12)
  })

  it('returns error with wrong passphrase', () => {
    const result = wdkJsonSafe(`wallet export --name ${WALLET_NAME}`, 'wrong-pass')
    assert.equal(result.code, 'WRONG_PASSPHRASE')
  })

  it('exports without (human output)', () => {
    const out = wdk(`wallet export --name ${WALLET_NAME}`)
    assert.ok(out.includes('Seed phrase'))
    assert.ok(out.includes('WARNING'))
  })
})

describe('wallet rename', () => {
  it('renames a wallet', () => {
    const result = wdkJson(`wallet rename --name human-test --new-name renamed-test`)
    assert.equal(result.oldName, 'human-test')
    assert.equal(result.newName, 'renamed-test')
    assert.equal(result.renamed, true)
  })

  it('renamed wallet appears in list', () => {
    const result = wdkJson('wallet list')
    assert.ok(result.wallets.some((w) => w.name === 'renamed-test'))
    assert.ok(!result.wallets.some((w) => w.name === 'human-test'))
  })

  it('returns error for nonexistent source wallet', () => {
    const result = wdkJsonSafe('wallet rename --name nonexistent --new-name foo')
    assert.ok(result.error.includes('not found'))
    assert.equal(result.code, 'KEY_NOT_FOUND')
  })

  it('returns error when target name already exists', () => {
    const result = wdkJsonSafe(`wallet rename --name renamed-test --new-name ${WALLET_NAME}`)
    assert.ok(result.error.includes('already exists'))
    assert.equal(result.code, 'WALLET_EXISTS')
  })
})

describe('config get', () => {
  it('returns all config as JSON', () => {
    const result = wdkJson('config get')
    assert.equal(result.defaultIndex, 0)
    assert.equal(result.indexer.baseUrl, 'https://wdk-api.tether.io')
  })

  it('returns specific key', () => {
    const result = wdkJson('config get --key defaultIndex')
    assert.equal(result.key, 'defaultIndex')
    assert.equal(result.value, 0)
  })

  it('returns null for nonexistent key', () => {
    const result = wdkJson('config get --key nonexistent.key')
    assert.equal(result.key, 'nonexistent.key')
    assert.equal(result.value, null)
  })

  it('returns network-scoped config', () => {
    const result = wdkJson('config get --network ethereum')
    assert.equal(result.network, 'ethereum')
    assert.match(result.config.provider, /^https?:\/\//)
    assert.equal(typeof result.config.transferMaxFee, 'number')
  })

  it('returns network-scoped key', () => {
    const result = wdkJson('config get --key provider --network ethereum')
    assert.equal(result.key, 'provider')
    assert.equal(result.network, 'ethereum')
    assert.ok(result.value.includes('http'))
  })
})

describe('config set', () => {
  it('sets a config value', () => {
    const result = wdkJson('config set --key test.setting --value hello')
    assert.equal(result.key, 'test.setting')
    assert.equal(result.value, 'hello')
    assert.equal(result.success, true)
  })

  it('verifies the value was set', () => {
    const result = wdkJson('config get --key test.setting')
    assert.equal(result.value, 'hello')
  })

  it('sets a JSON object value', () => {
    const result = wdkJson(`config set --key test.obj --value '{"a":1}'`)
    assert.equal(result.success, true)
    assert.equal(result.value.a, 1)
  })

  it('sets a network-scoped value', () => {
    const result = wdkJson('config set --key transferMaxFee --value 999 --network sepolia')
    assert.equal(result.success, true)
  })
})

describe('config reset', () => {
  it('resets a config value', () => {
    const result = wdkJson('config reset --key transferMaxFee --network sepolia')
    assert.equal(result.reset, true)
    assert.ok(result.key.includes('sepolia'))
  })
})

describe('config path', () => {
  it('returns config path', () => {
    const result = wdkJson('config path')
    assert.ok(result.path.includes('wdk-cli'))
    assert.ok(result.path.includes('config.json'))
  })

  it('returns path without (human output)', () => {
    const out = wdk('config path')
    assert.ok(out.includes('wdk-cli'))
  })
})

describe('network list', () => {
  it('lists all networks', () => {
    const result = wdkJson('network list')
    assert.ok(result.count > 0)
    assert.ok(result.networks.some((n) => n.name === 'ethereum'))
    assert.ok(result.networks.some((n) => n.name === 'bitcoin'))
  })

  it('filters testnet only', () => {
    const result = wdkJson('network list --testnet')
    for (const n of result.networks) {
      assert.equal(n.testnet, true)
    }
  })

  it('filters mainnet only', () => {
    const result = wdkJson('network list --mainnet')
    for (const n of result.networks) {
      assert.equal(n.testnet, false)
    }
  })
})

describe('network info', () => {
  it('returns network details', () => {
    const result = wdkJson('network info --network ethereum')
    assert.equal(result.name, 'ethereum')
    assert.ok(result.displayName.includes('Ethereum'))
    assert.equal(result.nativeSymbol, 'ETH')
    assert.equal(result.decimals, 18)
  })

  it('returns testnet network details', () => {
    const result = wdkJson('network info --network sepolia')
    assert.equal(result.name, 'sepolia')
    assert.equal(result.nativeSymbol, 'ETH')
  })

  it('returns error for invalid network', () => {
    const result = wdkJsonSafe('network info --network fakenet')
    assert.ok(result.error.includes('not supported'))
    assert.equal(result.code, 'NETWORK_NOT_SUPPORTED')
  })
})

describe('network create/delete', () => {
  it('creates a custom network', () => {
    const networkData = JSON.stringify({
      displayName: 'JSON Test Net',
      module: '@tetherto/wdk-wallet-evm',
      nativeSymbol: 'JTN',
      decimals: 18,
      testnet: true,
    })
    const result = wdkJson(`network create --name json-test-net --network-data '${networkData}'`)
    assert.equal(result.name, 'json-test-net')
    assert.equal(result.displayName, 'JSON Test Net')
    assert.equal(result.nativeSymbol, 'JTN')
    assert.equal(result.custom, true)
  })

  it('custom network appears in list', () => {
    const result = wdkJson('network list')
    const custom = result.networks.find((n) => n.name === 'json-test-net')
    assert.equal(custom?.custom, true)
  })

  it('custom network info returns full details', () => {
    const result = wdkJson('network info --network json-test-net')
    assert.equal(result.displayName, 'JSON Test Net')
    assert.equal(result.nativeSymbol, 'JTN')
  })

  it('deletes custom network', () => {
    const result = wdkJson('network delete --name json-test-net')
    assert.equal(result.name, 'json-test-net')
    assert.equal(result.deleted, true)
  })

  it('deleted network gone from list', () => {
    const result = wdkJson('network list')
    assert.ok(!result.networks.some((n) => n.name === 'json-test-net'))
  })

  it('cannot delete built-in network', () => {
    const result = wdkJsonSafe('network delete --name ethereum')
    assert.ok(result.error.includes('built-in'))
    assert.equal(result.code, 'INVALID_ARGUMENT')
  })

  it('cannot delete nonexistent custom network', () => {
    const result = wdkJsonSafe('network delete --name ghost-net')
    assert.ok(result.error.includes('not found'))
    assert.equal(result.code, 'NETWORK_NOT_SUPPORTED')
  })
})

describe('get commands error cases', () => {
  it('get address returns wallet not unlocked error', () => {
    const result = wdkJsonSafe(`get address --network ethereum --wallet ${WALLET_NAME}`)
    assert.ok(result.error.includes('not unlocked'))
    assert.equal(result.code, 'WALLET_NOT_UNLOCKED')
  })

  it('get balance returns wallet not unlocked error', () => {
    const result = wdkJsonSafe(`get balance --network ethereum --wallet ${WALLET_NAME}`)
    assert.ok(result.error.includes('not unlocked'))
    assert.equal(result.code, 'WALLET_NOT_UNLOCKED')
  })

  it('get address without wallet shows error', () => {
    const result = wdkJsonSafe('get address --network ethereum')
    assert.ok(result.error.includes('not unlocked'))
    assert.equal(result.code, 'WALLET_NOT_UNLOCKED')
  })
})

describe('send error cases', () => {
  it('returns wallet not unlocked error', () => {
    const result = wdkJsonSafe(`send --network ethereum --to 0x1234567890abcdef1234567890abcdef12345678 --amount 1000 --wallet ${WALLET_NAME}`)
    assert.ok(result.error.includes('not unlocked'))
    assert.equal(result.code, 'WALLET_NOT_UNLOCKED')
  })

  it('send with invalid amount returns error', () => {
    const result = wdkJsonSafe(`send --network ethereum --to 0x1234567890abcdef1234567890abcdef12345678 --amount 0 --wallet ${WALLET_NAME}`)
    assert.ok(result.error.includes('not unlocked'))
    assert.equal(result.code, 'WALLET_NOT_UNLOCKED')
  })
})

describe('buy/sell error cases', () => {
  it('buy returns wallet not unlocked error', () => {
    const result = wdkJsonSafe(`buy --network ethereum --token usdt --fiat-amount 100 --wallet ${WALLET_NAME}`)
    assert.ok(result.error.includes('not unlocked'))
    assert.equal(result.code, 'WALLET_NOT_UNLOCKED')
  })

  it('sell returns wallet not unlocked error', () => {
    const result = wdkJsonSafe(`sell --network ethereum --token usdt --crypto-amount 50 --wallet ${WALLET_NAME}`)
    assert.ok(result.error.includes('not unlocked'))
    assert.equal(result.code, 'WALLET_NOT_UNLOCKED')
  })

  it('buy with both amounts returns error', () => {
    const result = wdkJsonSafe(`buy --network ethereum --token usdt --fiat-amount 100 --crypto-amount 50 --wallet ${WALLET_NAME}`)
    assert.ok(result.error.includes('Cannot specify both'))
    assert.equal(result.code, 'INVALID_ARGUMENT')
  })
})

describe('error output', () => {
  it('wrong passphrase returns structured JSON error', () => {
    const result = wdkJsonSafe(`wallet export --name ${WALLET_NAME}`, 'wrong')
    assert.equal(result.error, 'Incorrect passphrase.')
    assert.equal(result.code, 'WRONG_PASSPHRASE')
  })

  it('nonexistent wallet returns structured JSON error', () => {
    const result = wdkJsonSafe('wallet default --name does-not-exist')
    assert.ok(result.error.includes('not found'))
    assert.equal(result.code, 'KEY_NOT_FOUND')
  })

  it('wrong passphrase without returns human error', () => {
    let output = ''
    try {
      wdk(`wallet export --name ${WALLET_NAME}`, 'wrong')
    } catch (e) {
      output = (e.stderr || e.stdout || '').toString().trim()
    }

    assert.ok(output.includes('Incorrect passphrase'))
    assert.ok(!output.startsWith('{'))
  })
})

describe('wallet delete', () => {
  it('deletes a wallet', () => {
    const result = wdkJsonSafe(`wallet delete --name renamed-test`)
    assert.equal(result.wallet, 'renamed-test')
    assert.equal(result.deleted, true)
  })

  it('deleted wallet not in list', () => {
    const result = wdkJson('wallet list')
    assert.ok(!result.wallets.some((w) => w.name === 'renamed-test'))
  })

  it('returns error deleting nonexistent wallet', () => {
    const result = wdkJsonSafe('wallet delete --name nonexistent')
    assert.ok(result.error.includes('not found'))
    assert.equal(result.code, 'KEY_NOT_FOUND')
  })

  it('deletes remaining test wallets', () => {
    for (const name of [WALLET_NAME, WALLET_NAME_2]) {
      const result = wdkJsonSafe(`wallet delete --name ${name}`)
      assert.equal(result.deleted, true)
    }

    const list = wdkJson('wallet list')
    assert.ok(!list.wallets.some((w) => w.name === WALLET_NAME))
    assert.ok(!list.wallets.some((w) => w.name === WALLET_NAME_2))
  })
})

describe('wallet import', () => {
  it('imports wallet from a valid seed phrase', { todo: true })
  it('rejects invalid seed phrase with INVALID_ARGUMENT code', { todo: true })
})

describe('wallet unlock/lock (requires daemon)', () => {
  it('unlock returns { unlocked: true, ttl }', { todo: true })
  it('unlock with wrong passphrase returns WRONG_PASSPHRASE', { todo: true })
  it('lock --name returns { locked: true }', { todo: true })
  it('lock without --name returns { locked: true, all: true }', { todo: true })
})

describe('get/send happy path (requires daemon)', () => {
  it('get address returns { address, network, index }', { todo: true })
  it('get balance native returns { balance, formatted, symbol }', { todo: true })
  it('get balance --token returns token balance shape', { todo: true })
  it('get balance --all returns array of network balances', { todo: true })
  it('get history returns { transfers: [...] }', { todo: true })
  it('send --dry-run returns preview shape', { todo: true })
  it('send invalid amount returns INVALID_AMOUNT before unlock check (when wallet is unlocked)', { todo: true })
})

describe('config set validation', () => {
  it('config set without --key and without --network returns INVALID_ARGUMENT', { todo: true })
  it('config set --network <invalid> returns NETWORK_NOT_SUPPORTED', { todo: true })
})

describe('network create validation', () => {
  it('missing displayName/module/nativeSymbol returns INVALID_ARGUMENT', { todo: true })
  it('invalid module not in VALID_WALLET_TYPES returns UNSUPPORTED_MODULE', { todo: true })
  it('non-integer decimals returns INVALID_ARGUMENT', { todo: true })
  it('decimals out of [0, 24] returns INVALID_ARGUMENT', { todo: true })
  it('uppercase or non-alphanum name returns INVALID_ARGUMENT', { todo: true })
  it('malformed --network-data JSON returns INVALID_ARGUMENT', { todo: true })
})

describe('global commands', () => {
  it('--version returns version string (or non-JSON)', { todo: true })
  it('exit code is non-zero on all error paths', { todo: true })
})

describe('mcp commands', () => {
  it('mcp list returns status per ai-tool', { todo: true })
  it('mcp setup --ai-tool <unknown> returns INVALID_ARGUMENT', { todo: true })
})
