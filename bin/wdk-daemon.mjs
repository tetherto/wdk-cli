#!/usr/bin/env -S node --disable-warning=ExperimentalWarning

const { startDaemon } = await import('../src/index.js')

startDaemon().catch((error) => {
  console.error('Daemon error:', error)
  process.exit(1)
})
