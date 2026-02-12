export type ChainName = 'bitcoin' | 'ethereum' | 'polygon' | 'arbitrum' | 'bsc' | 'avalanche'

export type ChainType = 'evm' | 'btc'

export interface ChainConfig {
  name: ChainName
  displayName: string
  type: ChainType
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
  chain: ChainName
  index: number
  to: string
  amount: string
  token?: string
  maxFee?: string
}

export interface TxResult {
  txHash: string
  chain: ChainName
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
  chain: ChainName
}

export interface WdkCliConfig {
  defaultChain: ChainName
  defaultIndex: number
  indexer: {
    baseUrl: string
    apiKey: string
  }
  providers: Partial<Record<ChainName, string>>
  evm: {
    transferMaxFee?: string
  }
  output: {
    json: boolean
    noColor: boolean
  }
}
