#!/usr/bin/env -S npx tsx
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
/**
 * Example: Test all networks — get address, get balance, send native, send token.
 *
 * Usage:
 *   WDK_TEST_SEED="your 12/24 word seed" npx tsx examples/all-testnet-networks.ts
 *
 * Optional env vars:
 *   WDK_MODE=testnet|mainnet  Select network set (default: testnet)
 *   WDK_SKIP_SEND=1           Skip send tests (address + balance only)
 *   WDK_SEND_AMOUNT=1000      Custom send amount in smallest unit (default: varies per network)
 */

import { WdkService } from '../src/services/wdk-service.js'
import { getNetworkConfig } from '../src/config/networks.js'
import { getKnownTokens } from '../src/config/tokens.js'
import type { NetworkName } from '../src/types/index.js'

const SEED = process.env.WDK_TEST_SEED
if (!SEED) {
  console.error('Error: WDK_TEST_SEED is required')
  console.error('Usage: WDK_TEST_SEED="your seed phrase" npx tsx examples/all-testnet-networks.ts')
  process.exit(1)
}

const MODE = (process.env.WDK_MODE || 'testnet') as 'testnet' | 'mainnet'
const SKIP_SEND = !!process.env.WDK_SKIP_SEND

interface NetworkTest {
  network: NetworkName
  token?: { address: string; symbol: string }
  sendNativeAmount: string
  sendTokenAmount?: string
}

function getDefaultNativeAmount(network: NetworkName): string {
  const config = getNetworkConfig(network)
  switch (config.type) {
    case 'wdk-wallet-evm':
    case 'wdk-wallet-evm-erc-4337':
      return '1000000000000' // 0.000001 ETH/BNB/etc
    case 'wdk-wallet-tron':
      return '1000000' // 1 TRX
    case 'wdk-wallet-solana':
      return '1000000' // 0.001 SOL
    case 'wdk-wallet-btc':
      return '1000' // 0.00001 BTC
    case 'wdk-wallet-spark':
      return '1000' // 0.00001 BTC
    default:
      return '1000'
  }
}

function getDefaultTokenAmount(network: NetworkName): string {
  switch (network) {
    case 'ethereum':
    case 'sepolia':
    case 'polygon':
    case 'arbitrum':
    case 'base':
    case 'avalanche':
    case 'smart-account-ethereum':
    case 'smart-account-sepolia':
    case 'smart-account-polygon':
    case 'smart-account-arbitrum':
    case 'smart-account-base':
    case 'smart-account-plasma':
      return '1000' // 0.001 USDT (6 decimals)
    case 'bsc':
      return '1000000000000000' // 0.001 USDT (18 decimals on BSC)
    case 'solana':
    case 'solana-testnet':
    case 'solana-devnet':
      return '1000' // 0.001 USDT (6 decimals)
    case 'tron':
    case 'tron-testnet':
      return '1000' // 0.001 USDT (6 decimals)
    default:
      return '1000'
  }
}

function buildNetworkTest(network: NetworkName): NetworkTest {
  const tokens = getKnownTokens(network)
  const firstToken = tokens.length > 0 ? tokens[0] : undefined

  return {
    network,
    token: firstToken ? { address: firstToken.address, symbol: firstToken.symbol } : undefined,
    sendNativeAmount: process.env.WDK_SEND_AMOUNT || getDefaultNativeAmount(network),
    sendTokenAmount: firstToken ? (process.env.WDK_SEND_AMOUNT || getDefaultTokenAmount(network)) : undefined,
  }
}

// Testnet token addresses (not in tokens.ts which is mainnet-only)
const TESTNET_TOKENS: Record<string, { address: string; symbol: string }> = {
  sepolia: { address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', symbol: 'USDT' },
  'tron-testnet': { address: 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs', symbol: 'USDT' },
}

const TESTNET_NETWORKS: NetworkName[] = [
  'bitcoin-testnet3',
  'sepolia',
  'solana-testnet',
  'solana-devnet',
  'spark-regtest',
  'tron-testnet',
  'smart-account-sepolia',
]

const MAINNET_NETWORKS: NetworkName[] = [
  'bitcoin',
  'ethereum',
  'polygon',
  'arbitrum',
  'base',
  'bsc',
  'avalanche',
  'solana',
  'spark',
  'tron',
  'smart-account-ethereum',
  'smart-account-polygon',
  'smart-account-arbitrum',
  'smart-account-base',
  'smart-account-plasma',
]

function buildTests(mode: 'testnet' | 'mainnet'): NetworkTest[] {
  const networks = mode === 'testnet' ? TESTNET_NETWORKS : MAINNET_NETWORKS
  return networks.map((network) => {
    const test = buildNetworkTest(network)
    // Override token for testnets (tokens.ts only has mainnet addresses)
    if (mode === 'testnet' && TESTNET_TOKENS[network]) {
      test.token = TESTNET_TOKENS[network]
      test.sendTokenAmount = process.env.WDK_SEND_AMOUNT || getDefaultTokenAmount(network)
    }
    return test
  })
}

function formatBalance(balance: bigint, decimals: number, symbol: string): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = balance / divisor
  const remainder = (balance % divisor).toString().padStart(decimals, '0')
  return `${whole}.${remainder} ${symbol}`
}

async function testNetwork(wdk: WdkService, test: NetworkTest): Promise<{ ok: boolean; errors: string[] }> {
  const { network } = test
  const config = getNetworkConfig(network)
  const errors: string[] = []

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${config.displayName} (${network})`)
  console.log(`${'─'.repeat(60)}`)

  try {
    await wdk.initialize(SEED!, network)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ❌ Initialize failed: ${msg}`)
    errors.push(`init: ${msg}`)
    return { ok: false, errors }
  }

  // Get address[0]
  let address = ''
  try {
    const account = await wdk.getAccount(network, 0)
    address = await account.getAddress()
    console.log(`  ✅ Address[0]: ${address}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ❌ Address[0]: ${msg}`)
    errors.push(`address[0]: ${msg}`)
  }

  // Get address[1] — also used as send recipient
  let sendTo = ''
  try {
    const account1 = await wdk.getAccount(network, 1)
    const addr1 = await account1.getAddress()
    if (addr1 === address) {
      console.log(`  ⚠️  Address[1]: same as [0] — ${addr1}`)
      errors.push('address[1]: same as address[0]')
    } else {
      console.log(`  ✅ Address[1]: ${addr1}`)
      sendTo = addr1
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ❌ Address[1]: ${msg}`)
    errors.push(`address[1]: ${msg}`)
  }

  // Get balance
  try {
    const account = await wdk.getAccount(network, 0)
    const balance = await account.getBalance()
    console.log(`  ✅ Balance:    ${formatBalance(balance, config.decimals, config.nativeSymbol)}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ❌ Balance: ${msg}`)
    errors.push(`balance: ${msg}`)
  }

  // Get token balance
  if (test.token) {
    try {
      const account = await wdk.getAccount(network, 0)
      const balance = await account.getTokenBalance(test.token.address)
      console.log(`  ✅ Token(${test.token.symbol}): ${balance}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`  ❌ Token(${test.token.symbol}): ${msg}`)
      errors.push(`token: ${msg}`)
    }
  }

  // Send tests — use address[1] as recipient
  if (!SKIP_SEND && sendTo) {
    // Send native
    try {
      const account = await wdk.getAccount(network, 0)
      const balance = await account.getBalance()
      if (balance <= BigInt(test.sendNativeAmount) * 2n) {
        console.log(`  ⏭️  Send native: insufficient balance, skipped`)
      } else {
        const result = await account.sendTransaction({
          to: sendTo,
          value: test.sendNativeAmount,
        })
        console.log(`  ✅ Send native: ${result.hash}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`  ❌ Send native: ${msg}`)
      errors.push(`sendNative: ${msg}`)
    }

    // Send token
    if (test.token && test.sendTokenAmount) {
      try {
        const account = await wdk.getAccount(network, 0)
        const tokenBalance = await account.getTokenBalance(test.token.address)
        if (tokenBalance < BigInt(test.sendTokenAmount)) {
          console.log(`  ⏭️  Send token(${test.token.symbol}): insufficient balance, skipped`)
        } else {
          const result = await account.transfer({
            token: test.token.address,
            recipient: sendTo,
            amount: test.sendTokenAmount,
          })
          console.log(`  ✅ Send token(${test.token.symbol}): ${result.hash}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.log(`  ❌ Send token(${test.token.symbol}): ${msg}`)
        errors.push(`sendToken: ${msg}`)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

async function main() {
  console.log(`Mode: ${MODE.toUpperCase()}`)
  if (SKIP_SEND) console.log('Skipping send tests (WDK_SKIP_SEND=1)')

  const tests = buildTests(MODE)
  console.log(`\nTesting ${tests.length} ${MODE} networks...\n`)

  const wdk = new WdkService()
  const results: { network: string; ok: boolean; errors: string[] }[] = []

  for (const test of tests) {
    const result = await testNetwork(wdk, test)
    results.push({ network: test.network, ...result })
  }

  wdk.dispose()

  console.log(`\n${'═'.repeat(60)}`)
  console.log('  SUMMARY')
  console.log(`${'═'.repeat(60)}`)

  const passed = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)

  for (const r of results) {
    const status = r.ok ? '✅' : '❌'
    const detail = r.ok ? '' : ` — ${r.errors.join(', ')}`
    console.log(`  ${status} ${r.network}${detail}`)
  }

  console.log()
  console.log(`  Total: ${results.length} | Passed: ${passed.length} | Failed: ${failed.length}`)
  console.log()

  if (failed.length > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
