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

const DUMMY_ENV_PASSPHRASE = 'dummy-env-passphrase'
const DUMMY_TYPED_PASSPHRASE = 'dummy-typed-passphrase'

jest.unstable_mockModule('@inquirer/prompts', () => ({
  password: jest.fn(async () => DUMMY_TYPED_PASSPHRASE),
  input: jest.fn(async () => 'dummy seed phrase')
}))

const { password } = await import('@inquirer/prompts')
const { promptPassphrase } = await import('../../../src/ui/prompts.js')

const originalEnvPassphrase = process.env.WDK_PASSPHRASE
const originalIsTTY = process.stdin.isTTY

const setStdinTTY = (isTTY) => Object.defineProperty(process.stdin, 'isTTY', { value: isTTY, configurable: true })

/** Captures the env-var notice, which would otherwise print during the run. */
let notices = []

beforeEach(() => {
  setStdinTTY(true)
  notices = []
  jest.spyOn(console, 'error').mockImplementation((line) => notices.push(String(line)))
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
  setStdinTTY(originalIsTTY)
  if (originalEnvPassphrase === undefined) {
    delete process.env.WDK_PASSPHRASE
  } else {
    process.env.WDK_PASSPHRASE = originalEnvPassphrase
  }
})

describe('promptPassphrase', () => {
  it('returns WDK_PASSPHRASE without prompting when set', async () => {
    process.env.WDK_PASSPHRASE = DUMMY_ENV_PASSPHRASE

    const result = await promptPassphrase('Enter passphrase:')

    expect(result).toBe(DUMMY_ENV_PASSPHRASE)
    expect(password).not.toHaveBeenCalled()
  })

  it('says once that the passphrase came from the environment', async () => {
    process.env.WDK_PASSPHRASE = DUMMY_ENV_PASSPHRASE
    // The notice fires once per module instance, so take a fresh one: by now
    // the import at the top of this file has already spent it.
    jest.resetModules()
    const { promptPassphrase: fresh } = await import('../../../src/ui/prompts.js')

    await fresh('Enter passphrase:')
    await fresh('Enter passphrase:')

    expect(notices).toEqual(['Note: using passphrase from WDK_PASSPHRASE env var.'])
  })

  it('prompts despite WDK_PASSPHRASE when allowEnv is false', async () => {
    process.env.WDK_PASSPHRASE = DUMMY_ENV_PASSPHRASE

    const result = await promptPassphrase('New passphrase:', { allowEnv: false })

    expect(result).toBe(DUMMY_TYPED_PASSPHRASE)
    expect(password).toHaveBeenCalledWith({ message: 'New passphrase:' })
  })

  it('refuses to prompt when stdin is piped and WDK_PASSPHRASE is not set', async () => {
    delete process.env.WDK_PASSPHRASE
    setStdinTTY(false)

    let error
    try { await promptPassphrase('Enter passphrase:') } catch (e) { error = e }
    expect(error.message).toBe('Cannot prompt for a passphrase when stdin is piped.')
    expect(error.suggestion).toBe('Set WDK_PASSPHRASE, or run from a terminal.')
    expect(password).not.toHaveBeenCalled()
  })

  it('points at the terminal when stdin is piped and the env var is not allowed', async () => {
    process.env.WDK_PASSPHRASE = DUMMY_ENV_PASSPHRASE
    setStdinTTY(false)

    let error
    try { await promptPassphrase('New passphrase:', { allowEnv: false }) } catch (e) { error = e }
    expect(error.message).toBe('Cannot prompt for a passphrase when stdin is piped.')
    expect(error.suggestion).toBe('Run from a terminal.')
    expect(password).not.toHaveBeenCalled()
  })

  it('prompts when WDK_PASSPHRASE is not set', async () => {
    delete process.env.WDK_PASSPHRASE

    const result = await promptPassphrase('Enter passphrase:')

    expect(result).toBe(DUMMY_TYPED_PASSPHRASE)
    expect(password).toHaveBeenCalledWith({ message: 'Enter passphrase:' })
  })
})
