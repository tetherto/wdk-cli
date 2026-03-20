export interface DaemonRequest {
  action: 'get_seed' | 'list_wallets' | 'status' | 'lock'
  wallet?: string
}

export interface DaemonResponse {
  ok: boolean
  data?: unknown
  error?: string
}

export const DAEMON_SOCKET_NAME = 'daemon.sock'
export const DAEMON_PID_NAME = 'daemon.pid'
