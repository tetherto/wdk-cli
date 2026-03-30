export type NetworkName = string

export type NetworkType = string

export interface NetworkConfig {
  name: string
  displayName: string
  type: NetworkType
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
  networks: Record<string, Record<string, unknown>>
  customNetworks?: Record<string, NetworkConfig>
  output: {
    json: boolean
  }
}
