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

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const PASSPHRASE = 'test-pass-123'
const WALLET_NAME = 'test-wallet'
const WALLET_NAME_2 = 'test-wallet-2'

let tempDir: string

function makeEnv(passphrase: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: tempDir,
    WDK_PASSPHRASE: passphrase,
  }
}

function wdk(args: string, passphrase: string = PASSPHRASE): string {
  return execSync(`node bin/wdk.mjs ${args}`, {
    encoding: 'utf8',
    timeout: 30000,
    env: makeEnv(passphrase),
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function wdkJson(args: string, passphrase: string = PASSPHRASE): unknown {
  const out = wdk(`--json ${args}`, passphrase)
  return JSON.parse(out)
}

function parseJsonLine(output: string): unknown {
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try { return JSON.parse(trimmed) } catch { /* keep trying */ }
  }
  throw new Error(`No parseable JSON line found in output:\n${output}`)
}

function wdkJsonSafe(args: string, passphrase: string = PASSPHRASE): unknown {
  try {
    return wdkJson(args, passphrase)
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string }
    const output = (err.stdout || err.stderr || '').trim()
    return parseJsonLine(output)
  }
}

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'wdk-test-'))
  execSync('npm run build', { stdio: 'inherit' })
})

afterAll(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
})

// ── Wallet Create ──

describe('wallet create', () => {
  it('creates a wallet and returns JSON with seed phrase', () => {
    const result = wdkJson(`wallet create --name ${WALLET_NAME} --words 12`) as {
      wallet: string; seedPhrase: string; setAsDefault: boolean
    }

    expect(result.wallet).toBe(WALLET_NAME)
    expect(result.seedPhrase.split(' ')).toHaveLength(12)
    expect(result.setAsDefault).toBe(true)
  })

  it('creates a second wallet (not default)', () => {
    const result = wdkJson(`wallet create --name ${WALLET_NAME_2} --words 24`) as {
      wallet: string; seedPhrase: string; setAsDefault: boolean
    }

    expect(result.wallet).toBe(WALLET_NAME_2)
    expect(result.seedPhrase.split(' ').length).toBe(24)
    expect(result.setAsDefault).toBe(false)
  })

  it('returns error for duplicate wallet name', () => {
    const result = wdkJsonSafe(`wallet create --name ${WALLET_NAME} --words 12`) as {
      error: string; code: string
    }

    expect(result.error).toContain('already exists')
    expect(result.code).toBe('WALLET_EXISTS')
  })

  it('creates wallet without (human output)', () => {
    const out = wdk('wallet create --name human-test --words 12')
    expect(out).toContain('Seed phrase')
  })
})

// ── Wallet List ──

describe('wallet list', () => {
  it('lists all wallets with status', () => {
    const result = wdkJson('wallet list') as {
      wallets: { name: string; default: boolean; unlocked: boolean }[]; count: number
    }

    expect(result.count).toBeGreaterThanOrEqual(3)
    expect(result.wallets.some(w => w.name === WALLET_NAME)).toBe(true)
    expect(result.wallets.some(w => w.name === WALLET_NAME_2)).toBe(true)
  })

  it('marks the first wallet as default', () => {
    const result = wdkJson('wallet list') as {
      wallets: { name: string; default: boolean }[]
    }

    const defaultWallet = result.wallets.find(w => w.default)
    expect(defaultWallet?.name).toBe(WALLET_NAME)
  })

  it('shows all wallets as locked initially', () => {
    const result = wdkJson('wallet list') as {
      wallets: { name: string; unlocked: boolean }[]
    }

    for (const w of result.wallets) {
      expect(w.unlocked).toBe(false)
    }
  })

  it('lists wallets without (human output)', () => {
    const out = wdk('wallet list')
    expect(out).toContain(WALLET_NAME)
    expect(out).toContain('locked')
  })
})

// ── Wallet Default ──

describe('wallet default', () => {
  it('sets default wallet', () => {
    const result = wdkJson(`wallet default --name ${WALLET_NAME_2}`) as {
      wallet: string; default: boolean
    }

    expect(result.wallet).toBe(WALLET_NAME_2)
    expect(result.default).toBe(true)
  })

  it('verifies default changed in list', () => {
    const result = wdkJson('wallet list') as {
      wallets: { name: string; default: boolean }[]
    }

    const defaultWallet = result.wallets.find(w => w.default)
    expect(defaultWallet!.name).toBe(WALLET_NAME_2)
  })

  it('restores default back', () => {
    wdkJson(`wallet default --name ${WALLET_NAME}`)
    const result = wdkJson('wallet list') as {
      wallets: { name: string; default: boolean }[]
    }

    expect(result.wallets.find(w => w.default)!.name).toBe(WALLET_NAME)
  })

  it('returns error for nonexistent wallet', () => {
    const result = wdkJsonSafe('wallet default --name nonexistent') as {
      error: string; code: string
    }

    expect(result.error).toContain('not found')
    expect(result.code).toBe('KEY_NOT_FOUND')
  })

  it('sets default without (human output)', () => {
    const out = wdk(`wallet default --name ${WALLET_NAME}`)
    expect(out).toContain('Default wallet set')
  })
})

// ── Wallet Export ──

describe('wallet export', () => {
  it('exports seed phrase as JSON', () => {
    const result = wdkJson(`wallet export --name ${WALLET_NAME}`) as {
      wallet: string; seedPhrase: string
    }

    expect(result.wallet).toBe(WALLET_NAME)
    expect(result.seedPhrase.split(' ')).toHaveLength(12)
  })

  it('returns error with wrong passphrase', () => {
    const result = wdkJsonSafe(`wallet export --name ${WALLET_NAME}`, 'wrong-pass') as {
      error: string; code: string
    }
    expect(result.code).toBe('WRONG_PASSPHRASE')
  })

  it('exports without (human output)', () => {
    const out = wdk(`wallet export --name ${WALLET_NAME}`)
    expect(out).toContain('Seed phrase')
    expect(out).toContain('WARNING')
  })
})

// ── Wallet Rename ──

describe('wallet rename', () => {
  it('renames a wallet', () => {
    const result = wdkJson(`wallet rename --name human-test --new-name renamed-test`) as {
      oldName: string; newName: string; renamed: boolean
    }

    expect(result.oldName).toBe('human-test')
    expect(result.newName).toBe('renamed-test')
    expect(result.renamed).toBe(true)
  })

  it('renamed wallet appears in list', () => {
    const result = wdkJson('wallet list') as {
      wallets: { name: string }[]
    }

    expect(result.wallets.some(w => w.name === 'renamed-test')).toBe(true)
    expect(result.wallets.some(w => w.name === 'human-test')).toBe(false)
  })

  it('returns error for nonexistent source wallet', () => {
    const result = wdkJsonSafe('wallet rename --name nonexistent --new-name foo') as {
      error: string; code: string
    }

    expect(result.error).toContain('not found')
    expect(result.code).toBe('KEY_NOT_FOUND')
  })

  it('returns error when target name already exists', () => {
    const result = wdkJsonSafe(`wallet rename --name renamed-test --new-name ${WALLET_NAME}`) as {
      error: string; code: string
    }

    expect(result.error).toContain('already exists')
    expect(result.code).toBe('WALLET_EXISTS')
  })
})

// ── Config Commands ──

describe('config get', () => {
  it('returns all config as JSON', () => {
    const result = wdkJson('config get') as Record<string, unknown>

    expect(result.defaultIndex).toBe(0)
    // apiKey may be overridden by WDK_INDEXER_API_KEY env var; only assert baseUrl
    expect(result.indexer).toMatchObject({ baseUrl: 'https://wdk-api.tether.io' })
  })

  it('returns specific key', () => {
    const result = wdkJson('config get --key defaultIndex') as {
      key: string; value: unknown
    }

    expect(result.key).toBe('defaultIndex')
    expect(result.value).toBe(0)
  })

  it('returns null for nonexistent key', () => {
    const result = wdkJson('config get --key nonexistent.key') as {
      key: string; value: unknown
    }

    expect(result.key).toBe('nonexistent.key')
    expect(result.value).toBeNull()
  })

  it('returns network-scoped config', () => {
    const result = wdkJson('config get --network ethereum') as {
      network: string; config: Record<string, unknown>
    }

    expect(result.network).toBe('ethereum')
    expect(result.config).toMatchObject({
      provider: expect.stringMatching(/^https?:\/\//),
      transferMaxFee: expect.any(Number),
    })
  })

  it('returns network-scoped key', () => {
    const result = wdkJson('config get --key provider --network ethereum') as {
      key: string; network: string; value: string
    }

    expect(result.key).toBe('provider')
    expect(result.network).toBe('ethereum')
    expect(result.value).toContain('http')
  })
})

describe('config set', () => {
  it('sets a config value', () => {
    const result = wdkJson('config set --key test.setting --value hello') as {
      key: string; value: unknown; success: boolean
    }

    expect(result.key).toBe('test.setting')
    expect(result.value).toBe('hello')
    expect(result.success).toBe(true)
  })

  it('verifies the value was set', () => {
    const result = wdkJson('config get --key test.setting') as {
      key: string; value: string
    }

    expect(result.value).toBe('hello')
  })

  it('sets a JSON object value', () => {
    const result = wdkJson(`config set --key test.obj --value '{"a":1}'`) as {
      key: string; value: unknown; success: boolean
    }

    expect(result.success).toBe(true)
    expect((result.value as { a: number }).a).toBe(1)
  })

  it('sets a network-scoped value', () => {
    const result = wdkJson('config set --key transferMaxFee --value 999 --network sepolia') as {
      key: string; value: unknown; success: boolean
    }

    expect(result.success).toBe(true)
  })
})

describe('config reset', () => {
  it('resets a config value', () => {
    const result = wdkJson('config reset --key transferMaxFee --network sepolia') as {
      key: string; reset: boolean; value: unknown
    }

    expect(result.reset).toBe(true)
    expect(result.key).toContain('sepolia')
  })
})


describe('config path', () => {
  it('returns config path', () => {
    const result = wdkJson('config path') as { path: string }

    expect(result.path).toContain('wdk-cli')
    expect(result.path).toContain('config.json')
  })

  it('returns path without (human output)', () => {
    const out = wdk('config path')
    expect(out).toContain('wdk-cli')
  })
})

// ── Network Commands ──

describe('network list', () => {
  it('lists all networks', () => {
    const result = wdkJson('network list') as {
      networks: { name: string; testnet: boolean }[]; count: number
    }

    expect(result.count).toBeGreaterThan(0)
    expect(result.networks.some(n => n.name === 'ethereum')).toBe(true)
    expect(result.networks.some(n => n.name === 'bitcoin')).toBe(true)
  })

  it('filters testnet only', () => {
    const result = wdkJson('network list --testnet') as {
      networks: { name: string; testnet: boolean }[]
    }

    for (const n of result.networks) {
      expect(n.testnet).toBe(true)
    }
  })

  it('filters mainnet only', () => {
    const result = wdkJson('network list --mainnet') as {
      networks: { name: string; testnet: boolean }[]
    }

    for (const n of result.networks) {
      expect(n.testnet).toBe(false)
    }
  })
})

// ── Network Info ──

describe('network info', () => {
  it('returns network details', () => {
    const result = wdkJson('network info --network ethereum') as {
      name: string; displayName: string; nativeSymbol: string; decimals: number
    }

    expect(result.name).toBe('ethereum')
    expect(result.displayName).toContain('Ethereum')
    expect(result.nativeSymbol).toBe('ETH')
    expect(result.decimals).toBe(18)
  })

  it('returns testnet network details', () => {
    const result = wdkJson('network info --network sepolia') as {
      name: string; nativeSymbol: string
    }

    expect(result.name).toBe('sepolia')
    expect(result.nativeSymbol).toBe('ETH')
  })

  it('returns error for invalid network', () => {
    const result = wdkJsonSafe('network info --network fakenet') as {
      error: string; code: string
    }

    expect(result.error).toContain('not supported')
    expect(result.code).toBe('NETWORK_NOT_SUPPORTED')
  })
})

// ── Network Create/Delete ──

describe('network create/delete', () => {
  it('creates a custom network', () => {
    const networkData = JSON.stringify({
      displayName: 'JSON Test Net',
      module: '@tetherto/wdk-wallet-evm',
      nativeSymbol: 'JTN',
      decimals: 18,
      testnet: true,
    })
    const result = wdkJson(`network create --name json-test-net --network-data '${networkData}'`) as {
      name: string; displayName: string; nativeSymbol: string; custom: boolean
    }

    expect(result.name).toBe('json-test-net')
    expect(result.displayName).toBe('JSON Test Net')
    expect(result.nativeSymbol).toBe('JTN')
    expect(result.custom).toBe(true)
  })

  it('custom network appears in list', () => {
    const result = wdkJson('network list') as {
      networks: { name: string; custom: boolean }[]
    }

    const custom = result.networks.find(n => n.name === 'json-test-net')
    expect(custom?.custom).toBe(true)
  })

  it('custom network info returns full details', () => {
    const result = wdkJson('network info --network json-test-net') as {
      name: string; displayName: string; nativeSymbol: string
    }

    expect(result.displayName).toBe('JSON Test Net')
    expect(result.nativeSymbol).toBe('JTN')
  })

  it('deletes custom network', () => {
    const result = wdkJson('network delete --name json-test-net') as {
      name: string; deleted: boolean
    }

    expect(result.name).toBe('json-test-net')
    expect(result.deleted).toBe(true)
  })

  it('deleted network gone from list', () => {
    const result = wdkJson('network list') as {
      networks: { name: string }[]
    }

    expect(result.networks.some(n => n.name === 'json-test-net')).toBe(false)
  })

  it('cannot delete built-in network', () => {
    const result = wdkJsonSafe('network delete --name ethereum') as {
      error: string; code: string
    }

    expect(result.error).toContain('built-in')
    expect(result.code).toBe('INVALID_ARGUMENT')
  })

  it('cannot delete nonexistent custom network', () => {
    const result = wdkJsonSafe('network delete --name ghost-net') as {
      error: string; code: string
    }

    expect(result.error).toContain('not found')
    expect(result.code).toBe('NETWORK_NOT_SUPPORTED')
  })
})

// ── Get/Send Error Cases (no daemon, JSON output) ──

describe('get commands error cases', () => {
  it('get address returns wallet not unlocked error', () => {
    const result = wdkJsonSafe(`get address --network ethereum --wallet ${WALLET_NAME}`) as {
      error: string; code: string
    }

    expect(result.error).toContain('not unlocked')
    expect(result.code).toBe('WALLET_NOT_UNLOCKED')
  })

  it('get balance returns wallet not unlocked error', () => {
    const result = wdkJsonSafe(`get balance --network ethereum --wallet ${WALLET_NAME}`) as {
      error: string; code: string
    }

    expect(result.error).toContain('not unlocked')
    expect(result.code).toBe('WALLET_NOT_UNLOCKED')
  })

  it('get address without wallet shows error', () => {
    const result = wdkJsonSafe('get address --network ethereum') as {
      error: string; code: string
    }

    // Default wallet is set but locked
    expect(result.error).toContain('not unlocked')
    expect(result.code).toBe('WALLET_NOT_UNLOCKED')
  })
})

describe('send error cases', () => {
  it('returns wallet not unlocked error', () => {
    const result = wdkJsonSafe(`send --network ethereum --to 0x1234567890abcdef1234567890abcdef12345678 --amount 1000 --wallet ${WALLET_NAME}`) as {
      error: string; code: string
    }

    expect(result.error).toContain('not unlocked')
    expect(result.code).toBe('WALLET_NOT_UNLOCKED')
  })

  it('send with invalid amount returns error', () => {
    const result = wdkJsonSafe(`send --network ethereum --to 0x1234567890abcdef1234567890abcdef12345678 --amount 0 --wallet ${WALLET_NAME}`) as {
      error: string; code: string
    }

    // Wallet unlock check happens first
    expect(result.error).toContain('not unlocked')
    expect(result.code).toBe('WALLET_NOT_UNLOCKED')
  })
})

describe('buy/sell error cases', () => {
  it('buy returns wallet not unlocked error', () => {
    const result = wdkJsonSafe(`buy --network ethereum --token usdt --wallet ${WALLET_NAME}`) as {
      error: string; code: string
    }

    expect(result.error).toContain('not unlocked')
    expect(result.code).toBe('WALLET_NOT_UNLOCKED')
  })

  it('sell returns wallet not unlocked error', () => {
    const result = wdkJsonSafe(`sell --network ethereum --token usdt --wallet ${WALLET_NAME}`) as {
      error: string; code: string
    }

    expect(result.error).toContain('not unlocked')
    expect(result.code).toBe('WALLET_NOT_UNLOCKED')
  })

  it('buy with both amounts returns error', () => {
    const result = wdkJsonSafe(`buy --network ethereum --token usdt --fiat-amount 100 --crypto-amount 50 --wallet ${WALLET_NAME}`) as {
      error: string; code: string
    }

    expect(result.error).toContain('Cannot specify both')
    expect(result.code).toBe('INVALID_ARGUMENT')
  })
})

// ── Error Format ──

describe('error output', () => {
  it('wrong passphrase returns structured JSON error', () => {
    const result = wdkJsonSafe(`wallet export --name ${WALLET_NAME}`, 'wrong') as {
      error: string; code: string
    }
    expect(result.error).toBe('Incorrect passphrase.')
    expect(result.code).toBe('WRONG_PASSPHRASE')
  })

  it('nonexistent wallet returns structured JSON error', () => {
    const result = wdkJsonSafe('wallet default --name does-not-exist') as {
      error: string; code: string
    }

    expect(result.error).toContain('not found')
    expect(result.code).toBe('KEY_NOT_FOUND')
  })

  it('wrong passphrase without returns human error', () => {
    let output = ''
    try {
      wdk(`wallet export --name ${WALLET_NAME}`, 'wrong')
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string }
      output = (err.stderr || err.stdout || '').trim()
    }

    expect(output).toContain('Incorrect passphrase')
    // Should NOT be JSON
    expect(output.startsWith('{')).toBe(false)
  })
})

// ── Cleanup: Delete Wallets ──

describe('wallet delete', () => {
  it('deletes a wallet', () => {
    const result = wdkJsonSafe(`wallet delete --name renamed-test`) as {
      wallet: string; deleted: boolean
    }

    expect(result.wallet).toBe('renamed-test')
    expect(result.deleted).toBe(true)
  })

  it('deleted wallet not in list', () => {
    const result = wdkJson('wallet list') as {
      wallets: { name: string }[]
    }

    expect(result.wallets.some(w => w.name === 'renamed-test')).toBe(false)
  })

  it('returns error deleting nonexistent wallet', () => {
    const result = wdkJsonSafe('wallet delete --name nonexistent') as {
      error: string; code: string
    }

    expect(result.error).toContain('not found')
    expect(result.code).toBe('KEY_NOT_FOUND')
  })

  it('deletes remaining test wallets', () => {
    for (const name of [WALLET_NAME, WALLET_NAME_2]) {
      const result = wdkJsonSafe(`wallet delete --name ${name}`) as {
        wallet: string; deleted: boolean
      }
      expect(result.deleted).toBe(true)
    }

    const list = wdkJson('wallet list') as { wallets: { name: string }[]; count: number }
    expect(list.wallets.some(w => w.name === WALLET_NAME)).toBe(false)
    expect(list.wallets.some(w => w.name === WALLET_NAME_2)).toBe(false)
  })
})

// ── Coverage gaps to fill (JSON) ──

describe('wallet import', () => {
  it.todo('imports wallet from a valid seed phrase')
  it.todo('rejects invalid seed phrase with INVALID_ARGUMENT code')
})

describe('wallet unlock/lock (requires daemon)', () => {
  it.todo('unlock returns { unlocked: true, ttl }')
  it.todo('unlock with wrong passphrase returns WRONG_PASSPHRASE')
  it.todo('lock --name returns { locked: true }')
  it.todo('lock without --name returns { locked: true, all: true }')
})

describe('get/send happy path (requires daemon)', () => {
  it.todo('get address returns { address, network, index }')
  it.todo('get balance native returns { balance, formatted, symbol }')
  it.todo('get balance --token returns token balance shape')
  it.todo('get balance --all returns array of network balances')
  it.todo('get history returns { transfers: [...] }')
  it.todo('send --dry-run returns preview shape')
  it.todo('send invalid amount returns INVALID_AMOUNT before unlock check (when wallet is unlocked)')
})

describe('config set validation', () => {
  it.todo('config set without --key and without --network returns INVALID_ARGUMENT')
  it.todo('config set --network <invalid> returns NETWORK_NOT_SUPPORTED')
})

describe('network create validation', () => {
  it.todo('missing displayName/module/nativeSymbol returns INVALID_ARGUMENT')
  it.todo('invalid module not in VALID_WALLET_TYPES returns UNSUPPORTED_MODULE')
  it.todo('non-integer decimals returns INVALID_ARGUMENT')
  it.todo('decimals out of [0, 24] returns INVALID_ARGUMENT')
  it.todo('uppercase or non-alphanum name returns INVALID_ARGUMENT')
  it.todo('malformed --network-data JSON returns INVALID_ARGUMENT')
})

describe('global commands', () => {
  it.todo('--version returns version string (or non-JSON)')
  it.todo('exit code is non-zero on all error paths')
})

describe('mcp commands', () => {
  it.todo('mcp list returns status per ai-tool')
  it.todo('mcp setup --ai-tool <unknown> returns INVALID_ARGUMENT')
})
