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

import { jest } from '@jest/globals'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

jest.setTimeout(30000)

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_BIN = join(__dirname, '..', '..', 'bin', 'wdk.mjs')

let configDir

function runCli (args, { input, env } = {}) {
  return spawnSync(process.execPath, [CLI_BIN, ...args], {
    encoding: 'utf8',
    input,
    env: { ...process.env, XDG_CONFIG_HOME: configDir, WDK_PASSPHRASE: '', ...env }
  })
}

beforeAll(() => {
  configDir = mkdtempSync(join(tmpdir(), 'wdk-cli-test-'))
})

afterAll(() => {
  rmSync(configDir, { recursive: true, force: true })
})

describe('run', () => {
  it('emits a JSON error for a missing required option when --json is set', () => {
    const result = runCli(['--json', 'token', 'info'])

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      error: "required option '--network <network>' not specified",
      code: 'INVALID_ARGUMENT',
      suggestion: 'Run the command with --help to see usage.'
    })
    expect(result.stderr).not.toContain('error:')
  })

  it('emits a JSON error for an unknown option when --json is set', () => {
    const result = runCli(['network', 'list', '--nope', '--json'])

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      error: "unknown option '--nope'",
      code: 'INVALID_ARGUMENT',
      suggestion: 'Run the command with --help to see usage.'
    })
    expect(result.stderr).not.toContain('error:')
  })

  it('emits a JSON error for an invalid option value when --json is set', () => {
    const result = runCli(['get', 'balance', '--network', 'ethereum', '--index', 'abc', '--json'])

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      error: "option '--index <n>' argument 'abc' is invalid. Must be a non-negative integer.",
      code: 'INVALID_ARGUMENT',
      suggestion: 'Run the command with --help to see usage.'
    })
  })

  it('prints the Commander error and help text without --json', () => {
    const result = runCli(['token', 'info'])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain("error: required option '--network <network>' not specified")
    expect(result.stderr).toContain('Params:')
  })

  it('exits 0 for --help with --json set', () => {
    const result = runCli(['--json', '--help'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage:')
  })

  it('exits 0 for --version with --json set', () => {
    const result = runCli(['--json', '--version'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('wdk-cli')
  })
})

describe('send spinner output', () => {
  const SEND_ARGS = [
    'send',
    '--network', 'ethereum',
    '--to', '0x000000000000000000000000000000000000dEaD',
    '--amount', '0.001'
  ]

  it('keeps stderr free of spinner output when --json is set', () => {
    const result = runCli([...SEND_ARGS, '--json'])

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      error: 'No default wallet configured.',
      code: 'MISSING_CONFIG',
      suggestion: 'Set one with: wdk wallet default --name <name>'
    })
    expect(result.stderr).not.toContain('Broadcasting transaction')
    expect(result.stderr).not.toContain('Transaction failed.')
  })

  it('still prints the spinner failure line without --json', () => {
    const result = runCli(SEND_ARGS)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Transaction failed.')
  })
})

describe('stdin secret flags', () => {
  const DUMMY_SEED =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  const DUMMY_PASSPHRASE = 'dummy-stdin-pass'
  const DUMMY_NEW_PASSPHRASE = 'dummy-stdin-pass-2'

  it('imports a wallet from stdin with --seed-stdin and WDK_PASSPHRASE', () => {
    const result = runCli(['wallet', 'import', '--name', 'stdintest', '--seed-stdin', '--json'], {
      input: `${DUMMY_SEED}\n`,
      env: { WDK_PASSPHRASE: DUMMY_PASSPHRASE }
    })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      wallet: 'stdintest',
      imported: true,
      setAsDefault: true
    })
    expect(result.stdout).not.toContain('abandon')
    expect(result.stderr).not.toContain('abandon')
  })

  it('fails cleanly with --seed-stdin when stdin is piped and WDK_PASSPHRASE is unset', () => {
    const result = runCli(['wallet', 'import', '--name', 'other', '--seed-stdin', '--json'], {
      input: `${DUMMY_SEED}\n`
    })

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      error: 'Cannot prompt for a passphrase when stdin is piped.',
      code: 'INVALID_ARGUMENT',
      suggestion: 'Set WDK_PASSPHRASE, or run from a terminal.'
    })
  })

  it('rejects an invalid seed phrase from stdin', () => {
    const result = runCli(['wallet', 'import', '--name', 'other', '--seed-stdin', '--json'], {
      input: 'not a valid seed phrase\n',
      env: { WDK_PASSPHRASE: DUMMY_PASSPHRASE }
    })

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout).code).toBe('INVALID_ARGUMENT')
    expect(JSON.parse(result.stdout).error).toBe('Invalid seed phrase. Must be 12 or 24 valid BIP-39 words.')
  })

  it('changes the passphrase from stdin with --new-passphrase-stdin', () => {
    const result = runCli(
      ['wallet', 'change-passphrase', '--name', 'stdintest', '--new-passphrase-stdin', '--json'],
      { input: `${DUMMY_NEW_PASSPHRASE}\n`, env: { WDK_PASSPHRASE: DUMMY_PASSPHRASE } }
    )

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ wallet: 'stdintest', changed: true })

    const exported = runCli(['wallet', 'export', '--name', 'stdintest', '--json'], {
      env: { WDK_PASSPHRASE: DUMMY_NEW_PASSPHRASE }
    })
    expect(exported.status).toBe(0)
    expect(JSON.parse(exported.stdout)).toEqual({ wallet: 'stdintest', seedPhrase: DUMMY_SEED })
  })

  it('rejects an empty new passphrase from stdin', () => {
    const result = runCli(
      ['wallet', 'change-passphrase', '--name', 'stdintest', '--new-passphrase-stdin', '--json'],
      { input: '\n', env: { WDK_PASSPHRASE: DUMMY_NEW_PASSPHRASE } }
    )

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      error: 'Empty new passphrase is not allowed with --new-passphrase-stdin.',
      code: 'INVALID_ARGUMENT'
    })
  })
})
