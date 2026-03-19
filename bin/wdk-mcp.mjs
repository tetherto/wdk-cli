#!/usr/bin/env node

// stdout must be clean for JSON-RPC — redirect everything else to stderr

process.removeAllListeners('warning')
process.on('warning', () => {})

console.log = (...args) => process.stderr.write(args.map(String).join(' ') + '\n')
console.warn = (...args) => process.stderr.write(args.map(String).join(' ') + '\n')
console.error = (...args) => process.stderr.write(args.map(String).join(' ') + '\n')

const _origStdoutWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => {
  const str = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString() : '')
  if (str.startsWith('{') || str.startsWith('Content-Length')) {
    return _origStdoutWrite(chunk, ...rest)
  }
  return process.stderr.write(chunk, ...rest)
}

const { startMcpServer } = await import('../dist/index.js')

startMcpServer().catch((error) => {
  process.stderr.write(`MCP server error: ${error}\n`)
  process.exit(1)
})
