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
const estimateFee = jest.fn()
const convertToUsd = jest.fn()

jest.unstable_mockModule('../../../src/daemon/client.js', () => ({
  daemonClient: { requireUnlocked, estimateFee }
}))

jest.unstable_mockModule('../../../src/services/price-service.js', () => ({ convertToUsd }))

const { previewSend } = await import('../../../src/actions/send.js')

const FROM = '0x1111111111111111111111111111111111111111'
const TO = '0x2222222222222222222222222222222222222222'
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const ONE_ETH = '1000000000000000000'
const DUMMY_FEE_QUOTE = { fee: '21000000000000', feeFormatted: '0.000021 ETH', from: FROM }

beforeEach(() => {
  requireUnlocked.mockReset()
  estimateFee.mockReset()
  convertToUsd.mockReset()
  requireUnlocked.mockResolvedValue('main')
  estimateFee.mockResolvedValue(DUMMY_FEE_QUOTE)
})

describe('previewSend', () => {
  it('returns the sender alongside the recipient, amount, and fee', async () => {
    convertToUsd.mockResolvedValueOnce(2000).mockResolvedValueOnce(0.04)

    const preview = await previewSend({ network: 'ethereum', index: 0, to: TO, amount: ONE_ETH })

    expect(preview).toEqual({
      network: 'ethereum',
      networkName: 'Ethereum',
      from: FROM,
      to: TO,
      amount: ONE_ETH,
      amountFormatted: '1 ETH',
      amountUsd: 2000,
      token: undefined,
      tokenSymbol: 'ETH',
      estimatedFee: '21000000000000',
      estimatedFeeFormatted: '0.000021 ETH',
      estimatedFeeUsd: 0.04
    })
    expect(estimateFee).toHaveBeenCalledWith('ethereum', 0, TO, ONE_ETH, undefined, 'main')
  })

  it('previews a token transfer with the token contract passed to the daemon', async () => {
    convertToUsd.mockResolvedValueOnce(1.5).mockResolvedValueOnce(0.04)

    const preview = await previewSend({ network: 'ethereum', index: 0, to: TO, amount: '1500000', token: USDT })

    expect(preview).toEqual({
      network: 'ethereum',
      networkName: 'Ethereum',
      from: FROM,
      to: TO,
      amount: '1500000',
      amountFormatted: '1.5 USDT',
      amountUsd: 1.5,
      token: USDT,
      tokenSymbol: 'USDT',
      estimatedFee: '21000000000000',
      estimatedFeeFormatted: '0.000021 ETH',
      estimatedFeeUsd: 0.04
    })
    expect(estimateFee).toHaveBeenCalledWith('ethereum', 0, TO, '1500000', USDT, 'main')
  })

  it('leaves the USD fields undefined when no price is available', async () => {
    convertToUsd.mockRejectedValue(new Error('no price'))

    const preview = await previewSend({ network: 'ethereum', index: 0, to: TO, amount: ONE_ETH })

    expect(preview).toEqual({
      network: 'ethereum',
      networkName: 'Ethereum',
      from: FROM,
      to: TO,
      amount: ONE_ETH,
      amountFormatted: '1 ETH',
      amountUsd: undefined,
      token: undefined,
      tokenSymbol: 'ETH',
      estimatedFee: '21000000000000',
      estimatedFeeFormatted: '0.000021 ETH',
      estimatedFeeUsd: undefined
    })
  })

  it('rejects an invalid recipient before asking the daemon', async () => {
    await expect(
      previewSend({ network: 'ethereum', index: 0, to: 'not-an-address', amount: ONE_ETH })
    ).rejects.toThrow("Invalid recipient address for 'ethereum' (INVALID_FORMAT).")
    expect(estimateFee).not.toHaveBeenCalled()
  })
})
