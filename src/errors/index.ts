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

export class MissingNetworkError extends WdkCliError {
  constructor() {
    super(
      'Missing --network flag.',
      'MISSING_NETWORK',
      `Run \`wdk network list\` to see options.`,
    )
  }
}

export class NetworkNotSupportedError extends WdkCliError {
  constructor(network: string) {
    super(
      `Network '${network}' is not supported.`,
      'NETWORK_NOT_SUPPORTED',
      `Run \`wdk network list\` to see supported networks.`,
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

  // Handle ethers.js and other coded errors
  if (error instanceof Error) {
    const coded = error as Error & { code?: string }
    if (coded.code) {
      const messages: Record<string, [string, string?]> = {
        INSUFFICIENT_FUNDS: ['Insufficient funds for this transaction.', 'Top up your wallet and try again.'],
        INVALID_ARGUMENT: ['Invalid argument.'],
        NETWORK_ERROR: ['Cannot reach the RPC provider.', 'Check your network connection and provider URL.'],
        SERVER_ERROR: ['RPC server error.', 'Try again later or switch to a different provider.'],
        TIMEOUT: ['Request timed out.', 'Check your network connection and try again.'],
      }
      const match = messages[coded.code]
      if (match) {
        console.error(chalk.red(`Error: ${match[0]}`))
        if (match[1]) console.error(chalk.yellow(`Hint: ${match[1]}`))
        if (verbose) console.error(error.stack)
        process.exit(1)
      }
    }

    console.error(chalk.red(`Error: ${error.message}`))
    if (verbose) console.error(error.stack)
    process.exit(1)
  }

  console.error(chalk.red('Unexpected error occurred.'))
  process.exit(2)
}
