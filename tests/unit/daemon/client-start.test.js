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
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createServer } from 'node:net'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDir = mkdtempSync(join(tmpdir(), 'wdk-start-test-'))
const SOCKET_PATH = join(tempDir, 'daemon.sock')
const PID_PATH = join(tempDir, 'daemon.pid')
const START_TIMEOUT_MS = 300

const spawnMock = jest.fn()

jest.unstable_mockModule('bare-runtime/spawn', () => ({ default: spawnMock }))

jest.unstable_mockModule('../../../src/daemon/bare/imports.js', () => ({
  writeBareLaunchFiles: async () => join(tempDir, 'main.mjs')
}))

jest.unstable_mockModule('../../../src/config/paths.js', () => ({
  getDaemonSocketPath: () => SOCKET_PATH,
  getDaemonPidPath: () => PID_PATH,
  getConfigDir: () => tempDir
}))

jest.unstable_mockModule('../../../src/config/constants.js', () => ({
  DAEMON_START_TIMEOUT_MS: START_TIMEOUT_MS,
  DAEMON_START_POLL_INTERVAL_MS: 5,
  IPC_CONTROL_TIMEOUT_MS: 5000,
  IPC_READ_TIMEOUT_MS: 30000,
  IPC_WRITE_TIMEOUT_MS: 60000,
  DEFAULT_FINALITY_TIMEOUT_MS: 150000,
  IPC_WAIT_BUFFER_MS: 30000
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

const STATUS = { unlocked: false, wallets: [], pid: process.pid }

/** @type {import('node:net').Server | null} */
let daemon = null

/**
 * Builds a stand-in for the spawned daemon process.
 *
 * @returns {EventEmitter & { stderr: PassThrough, kill: jest.Mock, unref: jest.Mock }} The fake child.
 */
function fakeChild () {
  return Object.assign(new EventEmitter(), {
    stderr: new PassThrough(),
    kill: jest.fn(),
    unref: jest.fn()
  })
}

/**
 * Starts answering status requests on the daemon socket, as a ready daemon would.
 *
 * @returns {Promise<void>}
 */
async function startFakeDaemon () {
  daemon = createServer((socket) => {
    socket.on('data', () => socket.end(JSON.stringify({ ok: true, data: STATUS }) + '\n'))
  })
  await new Promise((resolve) => daemon.listen(SOCKET_PATH, () => resolve(undefined)))
  writeFileSync(PID_PATH, String(process.pid))
}

afterEach(async () => {
  spawnMock.mockReset()
  if (daemon) {
    await new Promise((resolve) => daemon.close(() => resolve(undefined)))
    daemon = null
  }
  rmSync(PID_PATH, { force: true })
})

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('DaemonClient ensureRunning', () => {
  it('resolves once the spawned daemon answers and lets the CLI exit without it', async () => {
    const child = fakeChild()
    spawnMock.mockImplementation(() => {
      setTimeout(() => { startFakeDaemon() }, 20)
      return child
    })
    const client = new DaemonClient()

    await client.ensureRunning()

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(child.unref).toHaveBeenCalledTimes(1)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('does not spawn when a daemon is already running', async () => {
    await startFakeDaemon()
    const client = new DaemonClient()

    await client.ensureRunning()

    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('rejects with the daemon stderr when it exits before answering', async () => {
    const child = fakeChild()
    spawnMock.mockImplementation(() => {
      setTimeout(() => {
        child.stderr.write('Daemon error: boom\n')
        setTimeout(() => child.emit('exit', 1), 5)
      }, 5)
      return child
    })
    const client = new DaemonClient()

    await expect(client.ensureRunning()).rejects.toThrow(
      'Failed to start wallet daemon: it exited with code 1: Daemon error: boom'
    )
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('kills the daemon and rejects when it does not answer in time', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const client = new DaemonClient()

    await expect(client.ensureRunning()).rejects.toThrow(
      'Failed to start wallet daemon: no answer within 0.3s.'
    )
    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(child.unref).toHaveBeenCalledTimes(1)
  })
})
