import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { derivePath } from 'ed25519-hd-key'
import * as bip39 from 'bip39'
import { configService } from './config-service.js'
import { NetworkError } from '../errors/index.js'
import type { NetworkName } from '../types/index.js'

export class SolanaService {
  private connections = new Map<NetworkName, Connection>()
  private seedPhrase: string | null = null

  initialize(seedPhrase: string): void {
    this.seedPhrase = seedPhrase
  }

  private getConnection(network: NetworkName): Connection {
    if (!this.connections.has(network)) {
      const providerUrl = configService.getProviderUrl(network)
      this.connections.set(network, new Connection(providerUrl, 'confirmed'))
    }
    return this.connections.get(network)!
  }

  getKeypair(index: number = 0): Keypair {
    if (!this.seedPhrase) {
      throw new Error('Solana service not initialized. Call initialize() first.')
    }
    const seed = bip39.mnemonicToSeedSync(this.seedPhrase)
    const path = `m/44'/501'/${index}'/0'`
    const derived = derivePath(path, seed.toString('hex'))
    return Keypair.fromSeed(derived.key)
  }

  getAddress(index: number = 0): string {
    return this.getKeypair(index).publicKey.toBase58()
  }

  async getBalance(network: NetworkName, index: number = 0): Promise<bigint> {
    const connection = this.getConnection(network)
    const keypair = this.getKeypair(index)
    try {
      const balance = await connection.getBalance(keypair.publicKey)
      return BigInt(balance)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
        throw new NetworkError(configService.getProviderUrl(network))
      }
      throw error
    }
  }

  async sendTransaction(
    network: NetworkName,
    index: number,
    to: string,
    amountLamports: bigint,
  ): Promise<{ hash: string; fee: bigint }> {
    const connection = this.getConnection(network)
    const fromKeypair = this.getKeypair(index)
    const toPublicKey = new PublicKey(to)

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports: Number(amountLamports),
      }),
    )

    const signature = await sendAndConfirmTransaction(connection, transaction, [fromKeypair])

    // Fetch tx to get fee
    const txInfo = await connection.getTransaction(signature)
    const fee = txInfo?.meta?.fee ? BigInt(txInfo.meta.fee) : BigInt(5000)

    return { hash: signature, fee }
  }

  async estimateFee(network: NetworkName, index: number = 0): Promise<bigint> {
    const connection = this.getConnection(network)
    const keypair = this.getKeypair(index)
    // Build a dummy transfer to estimate fee via getFeeForMessage
    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: keypair.publicKey,
    }).add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: keypair.publicKey,
        lamports: 0,
      }),
    )
    const message = tx.compileMessage()
    const feeResult = await connection.getFeeForMessage(message)
    return BigInt(feeResult.value ?? 5000)
  }

  async requestAirdrop(network: NetworkName, index: number = 0, amount: number = 1): Promise<string> {
    const connection = this.getConnection(network)
    const keypair = this.getKeypair(index)
    const signature = await connection.requestAirdrop(keypair.publicKey, amount * LAMPORTS_PER_SOL)
    await connection.confirmTransaction(signature)
    return signature
  }

  dispose(): void {
    this.connections.clear()
    this.seedPhrase = null
  }
}

export const solanaService = new SolanaService()
