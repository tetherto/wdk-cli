export type NetworkName =
  | 'bitcoin'
  | 'bitcoin-testnet3'
  | 'bitcoin-signet'
  | 'ethereum'
  | 'sepolia'
  | 'polygon'
  | 'arbitrum'
  | 'base'
  | 'bsc'
  | 'avalanche'
  | 'solana'
  | 'solana-testnet'
  | 'solana-devnet'
  | 'spark'
  | 'spark-regtest'
  | 'smart-account-ethereum'
  | 'smart-account-sepolia'
  | 'smart-account-polygon'
  | 'smart-account-arbitrum'
  | 'smart-account-base'
  | 'smart-account-plasma'
  | 'tron'
  | 'tron-testnet'

export type NetworkType = 'wdk-wallet-evm' | 'wdk-wallet-btc' | 'wdk-wallet-solana' | 'wdk-wallet-spark' | 'wdk-wallet-evm-erc-4337' | 'wdk-wallet-tron'

export type Erc4337Mode = 'paymasterToken' | 'sponsored' | 'nativeCoins'

export interface ConfigFieldSchema {
  key: string
  description: string
  required?: boolean | ((config: Record<string, unknown>) => boolean)
  secret?: boolean
  type?: 'string' | 'number' | 'boolean'
  options?: string[]
  condition?: (config: Record<string, unknown>) => boolean
}

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
  networks: Record<string, Record<string, unknown>>
  customNetworks?: Record<string, NetworkConfig>
  output: {
    json: boolean
    noColor: boolean
  }
}
