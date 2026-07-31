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

afterEach(() => {
  jest.clearAllMocks()
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

  it('prompts despite WDK_PASSPHRASE when allowEnv is false', async () => {
    process.env.WDK_PASSPHRASE = DUMMY_ENV_PASSPHRASE

    const result = await promptPassphrase('New passphrase:', { allowEnv: false })

    expect(result).toBe(DUMMY_TYPED_PASSPHRASE)
    expect(password).toHaveBeenCalledWith({ message: 'New passphrase:' })
  })

  it('prompts when WDK_PASSPHRASE is not set', async () => {
    delete process.env.WDK_PASSPHRASE

    const result = await promptPassphrase('Enter passphrase:')

    expect(result).toBe(DUMMY_TYPED_PASSPHRASE)
    expect(password).toHaveBeenCalledWith({ message: 'Enter passphrase:' })
  })
})
