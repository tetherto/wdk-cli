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
