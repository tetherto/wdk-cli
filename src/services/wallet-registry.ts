import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ChainName } from '../types/index.js'

export interface WalletEntry {
  chain: ChainName
  index: number
  address: string
  createdAt: string
}

export class WalletRegistry {
  private entries: WalletEntry[] = []
  private loaded = false

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    if (this.loaded) return
    try {
      const data = await readFile(this.path, 'utf8')
      this.entries = JSON.parse(data)
    } catch {
      this.entries = []
    }
    this.loaded = true
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, JSON.stringify(this.entries, null, 2), 'utf8')
  }

  async add(entry: Omit<WalletEntry, 'createdAt'>): Promise<WalletEntry> {
    await this.load()
    const existing = this.entries.find(
      (e) => e.chain === entry.chain && e.index === entry.index,
    )
    if (existing) return existing

    const newEntry: WalletEntry = {
      ...entry,
      createdAt: new Date().toISOString(),
    }
    this.entries.push(newEntry)
    await this.save()
    return newEntry
  }

  async list(chain?: ChainName): Promise<WalletEntry[]> {
    await this.load()
    if (chain) {
      return this.entries.filter((e) => e.chain === chain)
    }
    return [...this.entries]
  }

  async find(chain: ChainName, index: number): Promise<WalletEntry | undefined> {
    await this.load()
    return this.entries.find((e) => e.chain === chain && e.index === index)
  }
}
