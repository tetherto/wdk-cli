import chalk from 'chalk'

export class WdkCliError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly suggestion?: string,
  ) {
    super(message)
    this.name = 'WdkCliError'
  }

  display(): void {
    console.error(chalk.red(`Error: ${this.message}`))
    if (this.suggestion) {
      console.error(chalk.yellow(`Hint: ${this.suggestion}`))
    }
  }
}

export class KeyNotFoundError extends WdkCliError {
  constructor() {
    super(
      'No key found.',
      'KEY_NOT_FOUND',
      'Run `wdk key generate` or `wdk key import` first.',
    )
  }
}

export class InvalidSeedPhraseError extends WdkCliError {
  constructor() {
    super(
      'Invalid seed phrase. Must be 12 or 24 BIP-39 words.',
      'INVALID_SEED_PHRASE',
    )
  }
}

export class WrongPasswordError extends WdkCliError {
  constructor() {
    super(
      'Incorrect password.',
      'WRONG_PASSWORD',
      'Try again with the correct password.',
    )
  }
}

export class ChainNotSupportedError extends WdkCliError {
  constructor(chain: string) {
    super(
      `Chain '${chain}' is not supported.`,
      'CHAIN_NOT_SUPPORTED',
      `Supported chains: bitcoin, ethereum, polygon, arbitrum, bsc, avalanche`,
    )
  }
}

export class InsufficientBalanceError extends WdkCliError {
  constructor(have: string, need: string, symbol: string) {
    super(
      `Insufficient balance. Have ${have} ${symbol}, need ${need} ${symbol} (+ fee).`,
      'INSUFFICIENT_BALANCE',
    )
  }
}

export class TransactionFailedError extends WdkCliError {
  constructor(reason: string, txHash?: string) {
    super(
      `Transaction failed: ${reason}${txHash ? `. TX: ${txHash}` : ''}`,
      'TRANSACTION_FAILED',
    )
  }
}

export class NetworkError extends WdkCliError {
  constructor(provider: string) {
    super(
      `Cannot reach ${provider}.`,
      'NETWORK_ERROR',
      'Check your RPC URL and network connection.',
    )
  }
}

export function handleError(error: unknown, verbose: boolean = false): never {
  if (error instanceof WdkCliError) {
    error.display()
    process.exit(1)
  }

  console.error(chalk.red('Unexpected error occurred.'))
  if (verbose && error instanceof Error) {
    console.error(error.stack)
  }
  process.exit(2)
}
