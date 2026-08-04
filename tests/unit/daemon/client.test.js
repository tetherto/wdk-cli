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
import { createServer } from 'node:net'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDir = mkdtempSync(join(tmpdir(), 'wdk-client-test-'))
const DUMMY_SOCKET_PATH = join(tempDir, 'daemon.sock')
const DUMMY_PID_PATH = join(tempDir, 'daemon.pid')

jest.unstable_mockModule('../../../src/config/constants.js', () => ({
  getDaemonSocketPath: () => DUMMY_SOCKET_PATH,
  getDaemonPidPath: () => DUMMY_PID_PATH,
  DAEMON_START_RETRIES: 1,
  DAEMON_START_RETRY_INTERVAL_MS: 1,
  DAEMON_SPAWN_TIMEOUT_MS: 100
}))

jest.unstable_mockModule('../../../src/services/config-service.js', () => ({
  configService: { getDefaultWallet: () => '' }
}))

jest.unstable_mockModule('../../../src/services/key-service.js', () => ({
  KeyService: class {}
}))

jest.unstable_mockModule('../../../src/security/keyring.js', () => ({
  WalletKeyring: class {}
}))

const { DaemonClient } = await import('../../../src/daemon/client.js')

/** @type {(socket: import('node:net').Socket) => void} */
let onConnection = () => {}
const server = createServer((socket) => onConnection(socket))

beforeAll(async () => {
  writeFileSync(DUMMY_PID_PATH, String(process.pid))
  await new Promise((resolve) => server.listen(DUMMY_SOCKET_PATH, () => resolve(undefined)))
})

afterAll(async () => {
  await new Promise((resolve) => server.close(() => resolve(undefined)))
  rmSync(tempDir, { recursive: true, force: true })
})

describe('DaemonClient request', () => {
  it('rejects when the daemon closes the connection without responding', async () => {
    onConnection = (socket) => {
      socket.on('data', () => socket.destroy())
    }
    const client = new DaemonClient()

    await expect(client.request({ action: 'status' })).rejects.toThrow(
      'Lost connection to the wallet daemon.'
    )
  })

  it('resolves normally when the daemon responds before closing', async () => {
    onConnection = (socket) => {
      socket.on('data', () => socket.end(JSON.stringify({ ok: true, data: {} }) + '\n'))
    }
    const client = new DaemonClient()

    const response = await client.request({ action: 'status' })

    expect(response).toEqual({ ok: true, data: {} })
  })
})
