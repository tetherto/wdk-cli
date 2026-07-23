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

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

// The config path is resolved when the service singleton is created, so the
// isolated config home must be set before the module is imported.
const tempDir = await mkdtemp(join(tmpdir(), 'wdk-test-'))
process.env.XDG_CONFIG_HOME = tempDir

const { configService } = await import('../../../src/services/config-service.js')

const CONFIG_PATH = join(tempDir, 'wdk-cli', 'config.json')

// conf seeds CONFIG_DEFAULTS into the file at construction and reads purely
// from disk afterwards, so tests restore this pristine snapshot between runs.
const PRISTINE_CONFIG = await readFile(CONFIG_PATH, 'utf8')

describe('ConfigService', () => {
  afterEach(async () => {
    delete process.env.WDK_INDEXER_API_KEY
    await writeFile(CONFIG_PATH, PRISTINE_CONFIG)
  })

  afterAll(async () => {
    delete process.env.XDG_CONFIG_HOME
    await rm(tempDir, { recursive: true, force: true })
  })

  it('resolves the config file path inside the config home', () => {
    expect(configService.configPath).toBe(CONFIG_PATH)
  })

  it('returns the default for unset keys', () => {
    expect(configService.get('defaultIndex')).toBe(0)
  })

  it('set persists the value to the config file', async () => {
    configService.set('defaultIndex', 1)

    expect(JSON.parse(await readFile(CONFIG_PATH, 'utf8')).defaultIndex).toBe(1)
  })

  it('get reads a persisted value', async () => {
    await mkdir(dirname(CONFIG_PATH), { recursive: true })
    await writeFile(CONFIG_PATH, '{"defaultIndex":2}')

    expect(configService.get('defaultIndex')).toBe(2)
  })

  it('delete removes the value from the config file', async () => {
    await mkdir(dirname(CONFIG_PATH), { recursive: true })
    await writeFile(CONFIG_PATH, '{"defaultIndex":2,"testKey":"testValue"}')

    configService.delete('testKey')

    expect(JSON.parse(await readFile(CONFIG_PATH, 'utf8'))).toEqual({ defaultIndex: 2 })
  })

  it('lists persisted values merged over defaults', async () => {
    await mkdir(dirname(CONFIG_PATH), { recursive: true })
    await writeFile(CONFIG_PATH, '{"defaultIndex":3}')

    const config = configService.list()

    expect(config.defaultIndex).toBe(3)
  })

  it('prefers the env var for the indexer apiKey', () => {
    process.env.WDK_INDEXER_API_KEY = 'test-api-key-123'

    expect(configService.get('indexer.apiKey')).toBe('test-api-key-123')
  })
})
