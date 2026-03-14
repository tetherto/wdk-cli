#!/usr/bin/env -S npx tsx
import { WdkService } from '../src/services/wdk-service.js'

const seed = process.env.WDK_TEST_SEED!

async function main() {
  const wdk = new WdkService()

  try {
    await wdk.initialize(seed, 'tron-testnet')
    const account = await wdk.getAccount('tron-testnet', 0)

    const addr = await account.getAddress()
    console.log('Address:', addr)

    const balance = await account.getBalance()
    console.log('TRX Balance:', balance)

    const tokenBalance = await account.getTokenBalance('TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs')
    console.log('USDT Balance:', tokenBalance)

    console.log('\nTrying transfer...')
    const result = await account.transfer({
      token: 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs',
      recipient: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
      amount: BigInt('1000000'),
    })
    console.log('Transfer result:', JSON.stringify(result, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2))
  } catch (e) {
    console.error('Error:', e)
  } finally {
    wdk.dispose()
  }
}

main()
