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

export type NetworkName =
  | 'bitcoin'
  | 'bitcoin-testnet3'
  | 'bitcoin-signet'
  | 'ethereum'
  | 'sepolia'
  | 'polygon'
  | 'arbitrum'
  | 'bsc'
  | 'avalanche'
  | 'solana'
  | 'solana-testnet'
  | 'solana-devnet'

export type NetworkType = 'wdk-wallet-evm' | 'wdk-wallet-btc' | 'wdk-wallet-solana'

export interface NetworkConfig {
  name: string
  displayName: string
  type: NetworkType
  nativeSymbol: string
  decimals: number
  custom?: boolean
  testnet?: boolean
}

export interface EncryptedPayload {
  version: 1
  salt: string
  iv: string
  tag: string
  ciphertext: string
}

export interface SendParams {
  network: NetworkName
  index: number
  to: string
  amount: string
  token?: string
  maxFee?: string
}

export interface TxResult {
  txHash: string
  network: NetworkName
  from: string
  to: string
  amount: string
  fee?: string
}

export interface TxHistoryEntry {
  txHash: string
  date: string
  direction: 'in' | 'out'
  amount: string
  counterparty: string
  network: NetworkName
}

export interface WdkCliConfig {
  defaultIndex: number
  indexer: {
    baseUrl: string
    apiKey: string
  }
  providers: Partial<Record<NetworkName, string>>
  evm: {
    transferMaxFee?: string
  }
  output: {
    json: boolean
    noColor: boolean
  }
}
