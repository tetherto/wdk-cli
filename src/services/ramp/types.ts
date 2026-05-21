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

import type { RampModule } from '../../config/ramp.js'

export type Direction = 'buy' | 'sell'

export interface ResolvedAssets {
  cryptoCode: string
  cryptoDecimals: number
  fiatDecimals: number
}

export interface RampInput {
  network: string
  token: string
  walletAddress: string
  fiatCurrency: string
  fiatAmount?: bigint
  cryptoAmount?: bigint
  fiatDecimals: number
  cryptoDecimals: number
}

export interface QuoteResult {
  fiatAmount: bigint
  cryptoAmount: bigint
  fee: bigint
  rate: string
}

export interface UrlResult {
  url: string
}

export interface RampProvider {
  readonly name: RampModule
  validateEnvironment(network: string): void
  resolveAssets(network: string, token: string, fiatCurrency: string): Promise<ResolvedAssets>
  quote(input: RampInput, direction: Direction): Promise<QuoteResult | undefined>
  buildUrl(input: RampInput, direction: Direction): Promise<UrlResult>
}
