#!/usr/bin/env -S node --disable-warning=ExperimentalWarning --disable-warning=DeprecationWarning

// Workaround: suppress noisy deprecation warnings from dependencies
// @gelatonetwork/relay-sdk prints a deprecation notice via console.warn on import
// ethers.js JsonRpcProvider prints retry messages to stderr on connection failure
// Dynamic import() ensures these filters run before any dependency code loads
const _origWarn = console.warn
console.warn = (...args) => {
  const msg = String(args[0] || '')
  if (msg.includes('@gelatonetwork/relay-sdk')) return
  _origWarn.apply(console, args)
}
const _origStderrWrite = process.stderr.write.bind(process.stderr)
process.stderr.write = (chunk, ...rest) => {
  const msg = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString() : '')
  if (msg.includes('JsonRpcProvider failed to detect network')) return true
  return _origStderrWrite(chunk, ...rest)
}

const { run } = await import('../dist/index.js')

run(process.argv).then(() => {
  process.exit(0)
}).catch((error) => {
  console.error(error)
  process.exit(2)
})
