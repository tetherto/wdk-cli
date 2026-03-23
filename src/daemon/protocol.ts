export type DaemonAction =
  | 'get_address'
  | 'get_balance'
  | 'get_history'
  | 'estimate_fee'
  | 'send'
  | 'list_wallets'
  | 'status'
  | 'lock'

export interface DaemonRequest {
  action: DaemonAction
  wallet?: string
  network?: string
  index?: number
  token?: string
  to?: string
  amount?: string
  limit?: number
}

export interface DaemonResponse {
  ok: boolean
  data?: unknown
  error?: string
}
