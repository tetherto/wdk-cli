#!/usr/bin/env -S node --disable-warning=ExperimentalWarning

// stdout must be clean for JSON-RPC — redirect everything else to stderr

console.log = (...args) => process.stderr.write(args.map(String).join(' ') + '\n')
console.warn = (...args) => process.stderr.write(args.map(String).join(' ') + '\n')

const _origStdoutWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => {
  const str = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString() : ''
  if (str.startsWith('{') || str.startsWith('Content-Length')) {
    return _origStdoutWrite(chunk, ...rest)
  }
  return process.stderr.write(chunk, ...rest)
}

const { startMcpServer } = await import('../src/index.js')

startMcpServer().catch((error) => {
  console.error('MCP server error:', error)
  process.exit(1)
})
