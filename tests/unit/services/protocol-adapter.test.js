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

import { buildOptions } from '../../../src/services/protocol-adapter.js'

const FROM = { address: '0xUSDT', decimals: 6 }
const TO = { address: '0xETH', decimals: 18 }

describe('buildOptions swap', () => {
  it('maps an exact-in swap to tokenIn/tokenOut/tokenInAmount', () => {
    const options = buildOptions('swap', { fromToken: FROM, toToken: TO, amountIn: 100000000n, recipient: '0xME' })

    expect(options).toEqual({ tokenIn: '0xUSDT', tokenOut: '0xETH', to: '0xME', tokenInAmount: 100000000n })
  })

  it('maps an exact-out swap to tokenOutAmount', () => {
    const options = buildOptions('swap', { fromToken: FROM, toToken: TO, amountOut: 50000000000000000n })

    expect(options).toEqual({ tokenIn: '0xUSDT', tokenOut: '0xETH', tokenOutAmount: 50000000000000000n })
  })
})

describe('buildOptions bridge', () => {
  it('maps a same-token bridge to token/targetChain/amount', () => {
    const options = buildOptions('bridge', { fromToken: FROM, toToken: FROM, toChain: 'arbitrum', amountIn: 100000000n, recipient: '0xME' })

    expect(options).toEqual({ token: '0xUSDT', targetChain: 'arbitrum', amount: 100000000n, recipient: '0xME' })
  })

  it('rejects exact-out on bridge', () => {
    expect(() => buildOptions('bridge', { fromToken: FROM, toToken: FROM, toChain: 'arbitrum', amountOut: 100000000n })).toThrow(
      'Bridge does not support --amount-out.'
    )
  })
})

describe('buildOptions swidge', () => {
  it('maps a cross-network swap to fromToken/toToken/toChain/fromTokenAmount', () => {
    const options = buildOptions('swidge', {
      fromToken: FROM, toToken: TO, toChain: 'base', amountIn: 100000000n, recipient: '0xME', slippage: 0.01
    })

    expect(options).toEqual({
      fromToken: '0xUSDT', toToken: '0xETH', toChain: 'base', recipient: '0xME', slippage: 0.01, fromTokenAmount: 100000000n
    })
  })

  it('omits toChain for a same-chain swidge and uses toTokenAmount for exact-out', () => {
    const options = buildOptions('swidge', { fromToken: FROM, toToken: TO, amountOut: 50000000000000000n })

    expect(options).toEqual({ fromToken: '0xUSDT', toToken: '0xETH', toTokenAmount: 50000000000000000n })
  })
})
