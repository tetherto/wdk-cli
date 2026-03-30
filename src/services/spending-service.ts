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

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { configService } from './config-service.js'

interface SpendingTransaction {
  timestamp: number
  network: string
  to: string
  amountUsd: number
  token?: string
  txHash: string
}

interface SpendingRecord {
  date: string
  totalUsd: number
  txCount: number
  transactions: SpendingTransaction[]
}

function getSpendingPath(): string {
  const configPath = configService.configPath
  return join(dirname(configPath), 'spending.json')
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getSpendingRecord(): SpendingRecord {
  const path = getSpendingPath()
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as SpendingRecord
    if (data.date !== today()) {
      return { date: today(), totalUsd: 0, txCount: 0, transactions: [] }
    }
    return data
  } catch {
    return { date: today(), totalUsd: 0, txCount: 0, transactions: [] }
  }
}

function saveSpendingRecord(record: SpendingRecord): void {
  const path = getSpendingPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 })
}

export function recordSpending(tx: SpendingTransaction): void {
  const record = getSpendingRecord()
  record.totalUsd += tx.amountUsd
  record.txCount += 1
  record.transactions.push(tx)
  saveSpendingRecord(record)
}
