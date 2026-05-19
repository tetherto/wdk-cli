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

export interface NetworkConfig {
  name: string
  displayName: string
  type: string
  module: string
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

export interface IndexerEntry {
  blockchain: string
  tokens: string[]
}

export interface WdkNetworkEntry {
  module: string
  displayName: string
  nativeSymbol: string
  decimals: number
  testnet?: boolean
  indexer?: IndexerEntry
  moonpay?: Record<string, string>
  config?: Record<string, unknown>
}

export interface WdkConfigFile {
  version: number
  defaults: Record<string, unknown>
  networks: Record<string, WdkNetworkEntry>
}

