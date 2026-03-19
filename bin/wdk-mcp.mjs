#!/usr/bin/env node

// MCP server entry point for wdk-wallet
// stdout MUST be clean for JSON-RPC — redirect everything else to stderr

// Suppress Node.js warnings (ExperimentalWarning, DeprecationWarning)
process.removeAllListeners('warning')
process.on('warning', () => {})

// Redirect all console methods to stderr
console.log = (...args) => process.stderr.write(args.map(String).join(' ') + '\n')
console.warn = (...args) => process.stderr.write(args.map(String).join(' ') + '\n')
console.error = (...args) => process.stderr.write(args.map(String).join(' ') + '\n')

// Guard stdout: only allow JSON-RPC messages (starting with { or Content-Length)
const _origStdoutWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => {
  const str = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString() : '')
  if (str.startsWith('{') || str.startsWith('Content-Length')) {
    return _origStdoutWrite(chunk, ...rest)
  }
  // Non-JSON-RPC output → redirect to stderr
  return process.stderr.write(chunk, ...rest)
}

const { startMcpServer } = await import('../dist/index.js')

startMcpServer().catch((error) => {
  process.stderr.write(`MCP server error: ${error}\n`)
  process.exit(1)
})
