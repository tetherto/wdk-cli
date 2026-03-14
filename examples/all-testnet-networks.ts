#!/usr/bin/env -S npx tsx
/**
 * Example: Test all testnet networks — get address, get balance, send native, send token.
 *
 * Usage:
 *   WDK_TEST_SEED="your 12/24 word seed" npx tsx examples/all-testnet-networks.ts
 *
 * Optional env vars:
 *   WDK_SKIP_SEND=1        Skip send tests (address + balance only)
 */

import { WdkService } from '../src/services/wdk-service.js'
import { getNetworkConfig } from '../src/config/networks.js'
import type { NetworkName } from '../src/types/index.js'

const SEED = process.env.WDK_TEST_SEED
if (!SEED) {
  console.error('Error: WDK_TEST_SEED is required')
  console.error('Usage: WDK_TEST_SEED="your seed phrase" npx tsx examples/all-testnet-networks.ts')
  process.exit(1)
}

const SKIP_SEND = !!process.env.WDK_SKIP_SEND

const ZERO_ADDRESS_EVM = '0x000000000000000000000000000000000000dEaD'
const ZERO_ADDRESS_TRON = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

interface NetworkTest {
  network: NetworkName
  token?: { address: string; symbol: string }
  sendNative?: { to: string; amount: string }
  sendToken?: { to: string; amount: string; token: string }
}

const TESTNET_NETWORKS: NetworkTest[] = [
  // ── BTC ──
  { network: 'bitcoin-testnet3' },

  // ── EVM ──
  {
    network: 'sepolia',
    token: { address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb', symbol: 'USDT' },
    sendNative: { to: ZERO_ADDRESS_EVM, amount: '1000000000000' },
    sendToken: { to: ZERO_ADDRESS_EVM, amount: '1000000', token: '0xd077A400968890Eacc75cdc901F0356c943e4fDb' },
  },

  // ── Solana ──
  { network: 'solana-testnet' },
  { network: 'solana-devnet' },

  // ── Spark ──
  { network: 'spark-regtest' },

  // ── Tron ──
  {
    network: 'tron-testnet',
    token: { address: 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs', symbol: 'USDT' },
    sendNative: { to: ZERO_ADDRESS_TRON, amount: '1000000' },
    sendToken: { to: ZERO_ADDRESS_TRON, amount: '1000000', token: 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs' },
  },

  // ── Smart Account (ERC-4337) ──
  { network: 'smart-account-sepolia' },
]

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

  try {
    const account1 = await wdk.getAccount(network, 1)
    const addr1 = await account1.getAddress()
    if (addr1 === address) {
      console.log(`  ⚠️  Address[1]: same as [0] — ${addr1}`)
      errors.push('address[1]: same as address[0]')
    } else {
      console.log(`  ✅ Address[1]: ${addr1}`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ❌ Address[1]: ${msg}`)
    errors.push(`address[1]: ${msg}`)
  }

  try {
    const account = await wdk.getAccount(network, 0)
    const balance = await account.getBalance()
    console.log(`  ✅ Balance:    ${formatBalance(balance, config.decimals, config.nativeSymbol)}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ❌ Balance: ${msg}`)
    errors.push(`balance: ${msg}`)
  }

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

  if (test.sendNative && !SKIP_SEND) {
    try {
      const account = await wdk.getAccount(network, 0)
      const balance = await account.getBalance()
      if (balance <= BigInt(test.sendNative.amount) * 2n) {
        console.log(`  ⏭️  Send native: insufficient balance, skipped`)
      } else {
        const result = await account.sendTransaction({
          to: test.sendNative.to,
          value: test.sendNative.amount,
        })
        console.log(`  ✅ Send native: ${result.hash}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`  ❌ Send native: ${msg}`)
      errors.push(`sendNative: ${msg}`)
    }
  }

  if (test.sendToken && !SKIP_SEND) {
    try {
      const account = await wdk.getAccount(network, 0)
      const tokenBalance = await account.getTokenBalance(test.sendToken.token)
      if (tokenBalance < BigInt(test.sendToken.amount)) {
        console.log(`  ⏭️  Send token: insufficient token balance, skipped`)
      } else {
        const result = await account.transfer({
          token: test.sendToken.token,
          recipient: test.sendToken.to,
          amount: test.sendToken.amount,
        })
        console.log(`  ✅ Send token: ${result.hash}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`  ❌ Send token: ${msg}`)
      errors.push(`sendToken: ${msg}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

async function main() {
  if (SKIP_SEND) {
    console.log('Skipping send tests (WDK_SKIP_SEND=1)')
  }

  console.log(`\nTesting ${TESTNET_NETWORKS.length} testnet networks...\n`)

  const wdk = new WdkService()
  const results: { network: string; ok: boolean; errors: string[] }[] = []

  for (const test of TESTNET_NETWORKS) {
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
