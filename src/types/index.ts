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

export type NetworkType = 'evm' | 'btc' | 'solana'

export interface NetworkConfig {
  name: NetworkName
  displayName: string
  type: NetworkType
  defaultProvider: string
  nativeSymbol: string
  decimals: number
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
  defaultNetwork: NetworkName
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
