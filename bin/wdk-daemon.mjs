#!/usr/bin/env -S node --disable-warning=ExperimentalWarning

const { startDaemon } = await import('../dist/index.js')

startDaemon().catch((error) => {
  process.stderr.write(`Daemon error: ${error.message || error}\n`)
  process.exit(1)
})
