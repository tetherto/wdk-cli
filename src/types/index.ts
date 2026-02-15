export type NetworkName =
  | 'bitcoin'
  | 'bitcoin-testnet'
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
