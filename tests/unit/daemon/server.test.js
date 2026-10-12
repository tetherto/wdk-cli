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
import { connect } from 'node:net'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDir = mkdtempSync(join(tmpdir(), 'wdk-daemon-test-'))
const SOCKET_PATH = join(tempDir, 'daemon.sock')
const PID_PATH = join(tempDir, 'daemon.pid')

const constants = await import('../../../src/config/constants.js')
jest.unstable_mockModule('../../../src/config/constants.js', () => ({
  ...constants,
  getDaemonSocketPath: () => SOCKET_PATH,
  getDaemonPidPath: () => PID_PATH
}))

const { WalletDaemon } = await import('../../../src/daemon/server.js')

/** @type {WalletDaemon} */
let daemon

/**
 * Sends one request over the socket and resolves the daemon's reply, exactly
 * as `DaemonClient` does: one newline-delimited JSON object each way.
 *
 * @param {Record<string, unknown>} request - The request to send.
 * @returns {Promise<Record<string, unknown>>} The parsed reply.
 */
function send (request) {
  return new Promise((resolve, reject) => {
    const socket = connect(SOCKET_PATH)
    let buffer = ''
    socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'))
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      const newline = buffer.indexOf('\n')
      if (newline === -1) return
      socket.destroy()
      resolve(JSON.parse(buffer.slice(0, newline)))
    })
    socket.on('error', reject)
  })
}

beforeAll(async () => {
  daemon = new WalletDaemon()
  await daemon.start()
})

afterAll(async () => {
  await daemon.close()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('the daemon IPC endpoint', () => {
  it('restricts the socket to the owner', () => {
    expect(statSync(SOCKET_PATH).mode & 0o077).toBe(0)
  })

  it('answers status without an unlocked wallet', async () => {
    const reply = await send({ action: 'status' })

    expect(reply.ok).toBe(true)
  })

  it('lists no wallets before any unlock', async () => {
    const reply = await send({ action: 'list_wallets' })

    expect(reply).toEqual({ ok: true, data: { wallets: [] } })
  })

  it('refuses an action it does not know', async () => {
    const reply = await send({ action: 'drain_funds' })

    expect(reply.ok).toBe(false)
  })

  it('refuses a send that names no recipient', async () => {
    const reply = await send({ action: 'send', network: 'ethereum' })

    expect(reply).toEqual({ ok: false, error: 'Missing required fields: network, to, amount' })
  })

  it('refuses a call_method that names no method', async () => {
    const reply = await send({ action: 'call_method', network: 'ethereum' })

    expect(reply).toEqual({ ok: false, error: 'Missing required field: method' })
  })

  it('refuses a sign_message that carries no message', async () => {
    const reply = await send({ action: 'sign_message', network: 'ethereum' })

    expect(reply).toEqual({ ok: false, error: 'Missing required field: message' })
  })

  it('refuses a verify_message that carries no signature', async () => {
    const reply = await send({ action: 'verify_message', network: 'ethereum', message: 'hi' })

    expect(reply).toEqual({ ok: false, error: 'Missing required fields: message, signature' })
  })

  it('refuses a get_transaction that carries no hash', async () => {
    const reply = await send({ action: 'get_transaction', network: 'ethereum' })

    expect(reply).toEqual({ ok: false, error: 'Missing required field: hash' })
  })

  it('rejects a line that is not JSON instead of closing the connection', async () => {
    const reply = await new Promise((resolve, reject) => {
      const socket = connect(SOCKET_PATH)
      let buffer = ''
      socket.on('connect', () => socket.write('not json\n'))
      socket.on('data', (chunk) => {
        buffer += chunk.toString()
        if (!buffer.includes('\n')) return
        socket.destroy()
        resolve(JSON.parse(buffer.slice(0, buffer.indexOf('\n'))))
      })
      socket.on('error', reject)
    })

    expect(reply.ok).toBe(false)
  })
})
