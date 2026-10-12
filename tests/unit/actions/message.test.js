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

const requireUnlocked = jest.fn()
const daemonSignMessage = jest.fn()
const daemonVerifyMessage = jest.fn()

jest.unstable_mockModule('../../../src/daemon/client.js', () => ({
  daemonClient: {
    requireUnlocked,
    signMessage: daemonSignMessage,
    verifyMessage: daemonVerifyMessage
  }
}))

const DUMMY_ADDRESS = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'
const DUMMY_SIGNATURE = '0x5d99b6f7f6d1f73d1a26497f2b1c89b24c0993913f86e9a2d02cd69887d9c94f3c880358579d811b21dd1b7fd9bb01c1d81d10e69f0384e675c32b39643be89201'
const WRONG_SIGNATURE = '0x2f61a72dd0dcc8b7c33c8f4f2af4f2f0b1e05f9a37c6c3f2be9f80b5b8c40e621dd23ac6ac47938bc42887d0c3b7f26548b0d0c1e28ffb6d1e94c2a45e4a45f800'

const { signMessage, verifyMessage } = await import('../../../src/actions/message.js')

beforeEach(() => {
  requireUnlocked.mockReset()
  daemonSignMessage.mockReset()
  daemonVerifyMessage.mockReset()
})

describe('signMessage', () => {
  it('signs a message and returns the signature with the signing address', async () => {
    requireUnlocked.mockResolvedValue('main')
    daemonSignMessage.mockResolvedValue({ address: DUMMY_ADDRESS, signature: DUMMY_SIGNATURE })

    const result = await signMessage({ network: 'ethereum', message: 'hello', index: 0 })

    expect(result).toEqual({
      network: 'ethereum',
      index: 0,
      address: DUMMY_ADDRESS,
      message: 'hello',
      signature: DUMMY_SIGNATURE
    })
    expect(daemonSignMessage).toHaveBeenCalledWith('ethereum', 'hello', 0, 'main')
  })

  it('passes the requested wallet through to the daemon', async () => {
    requireUnlocked.mockResolvedValue('savings')
    daemonSignMessage.mockResolvedValue({ address: DUMMY_ADDRESS, signature: DUMMY_SIGNATURE })

    const result = await signMessage({ network: 'ethereum', message: 'hello', index: 2, wallet: 'savings' })

    expect(result).toEqual({
      network: 'ethereum',
      index: 2,
      address: DUMMY_ADDRESS,
      message: 'hello',
      signature: DUMMY_SIGNATURE
    })
    expect(requireUnlocked).toHaveBeenCalledWith('savings')
    expect(daemonSignMessage).toHaveBeenCalledWith('ethereum', 'hello', 2, 'savings')
  })

  it('rejects an empty message', async () => {
    requireUnlocked.mockResolvedValue('main')

    await expect(signMessage({ network: 'ethereum', message: '', index: 0 })).rejects.toThrow(
      'Message must be a non-empty string.'
    )
    expect(daemonSignMessage).not.toHaveBeenCalled()
  })

  it('rejects an unknown network', async () => {
    requireUnlocked.mockResolvedValue('main')

    await expect(signMessage({ network: 'nope', message: 'hello', index: 0 })).rejects.toThrow(
      "Network 'nope' is not supported."
    )
  })
})

describe('verifyMessage', () => {
  it('returns the verification outcome from the daemon', async () => {
    requireUnlocked.mockResolvedValue('main')
    daemonVerifyMessage.mockResolvedValue({ valid: true, address: DUMMY_ADDRESS })

    const result = await verifyMessage({
      network: 'ethereum',
      message: 'hello',
      signature: DUMMY_SIGNATURE,
      index: 0
    })

    expect(result).toEqual({
      network: 'ethereum',
      index: 0,
      message: 'hello',
      signature: DUMMY_SIGNATURE,
      address: DUMMY_ADDRESS,
      valid: true
    })
    expect(daemonVerifyMessage).toHaveBeenCalledWith('ethereum', 'hello', DUMMY_SIGNATURE, 0, 'main')
  })

  it('reports an invalid signature as valid: false', async () => {
    requireUnlocked.mockResolvedValue('main')
    daemonVerifyMessage.mockResolvedValue({ valid: false, address: DUMMY_ADDRESS })

    const result = await verifyMessage({
      network: 'ethereum',
      message: 'hello',
      signature: WRONG_SIGNATURE,
      index: 0
    })

    expect(result).toEqual({
      network: 'ethereum',
      index: 0,
      message: 'hello',
      signature: WRONG_SIGNATURE,
      address: DUMMY_ADDRESS,
      valid: false
    })
    expect(daemonVerifyMessage).toHaveBeenCalledWith('ethereum', 'hello', WRONG_SIGNATURE, 0, 'main')
  })

  it('rejects an empty signature', async () => {
    requireUnlocked.mockResolvedValue('main')

    await expect(
      verifyMessage({ network: 'ethereum', message: 'hello', signature: '', index: 0 })
    ).rejects.toThrow('Signature must be a non-empty string.')
    expect(daemonVerifyMessage).not.toHaveBeenCalled()
  })

  it('rejects an empty message', async () => {
    requireUnlocked.mockResolvedValue('main')

    await expect(
      verifyMessage({ network: 'ethereum', message: '', signature: '0xsig', index: 0 })
    ).rejects.toThrow('Message must be a non-empty string.')
  })
})
