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

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Cli } from './helpers.js'

const MCP_BIN = fileURLToPath(new URL('../../bin/wdk-mcp.mjs', import.meta.url))

/** @type {Cli} */
let cli
/** @type {Client} */
let client

beforeEach(async () => {
  cli = new Cli()
  client = new Client({ name: 'wdk-cli-tests', version: '1.0.0' })
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [MCP_BIN],
    env: { XDG_CONFIG_HOME: cli.configHome, HOME: cli.home }
  }))
})

afterEach(async () => {
  await client.close()
  await cli.run(['wallet', 'lock', '--all'], { unlocked: true })
  cli.cleanup()
})

/**
 * Calls the `list_wallets` tool and parses its result.
 *
 * @returns {Promise<{ wallets: object[], count: number }>} The tool's result.
 */
async function callListWallets () {
  const result = await client.callTool({ name: 'list_wallets', arguments: {} })
  return JSON.parse(result.content[0].text)
}

describe('list_wallets', () => {
  it('reports a locked wallet and leaves the daemon stopped', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })

    expect(await callListWallets()).toEqual({
      wallets: [{ name: 'w1', default: true, unlocked: false }],
      count: 1
    })
    expect(existsSync(join(cli.configHome, 'wdk-cli', 'daemon.pid'))).toBe(false)
  })

  it('reports the session of an unlocked wallet', async () => {
    await cli.json(['wallet', 'create', '--name', 'w1'], { unlocked: true })
    await cli.run(['wallet', 'unlock', '--name', 'w1', '--ttl', '5'], { unlocked: true })

    const { wallets } = await callListWallets()

    expect(wallets).toEqual([
      { name: 'w1', default: true, unlocked: true, ttlMs: 300000, ttlRemaining: expect.any(Number) }
    ])
  })
})
