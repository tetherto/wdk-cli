#!/usr/bin/env node

const password = process.env.WDK_DAEMON_PASSWORD
const ttl = parseInt(process.env.WDK_DAEMON_TTL || '30', 10)

if (!password) {
  process.stderr.write('Error: WDK_DAEMON_PASSWORD not set\n')
  process.exit(1)
}

const { startDaemon } = await import('../dist/index.js')

startDaemon(password, ttl).catch((error) => {
  process.stderr.write(`Daemon error: ${error.message || error}\n`)
  process.exit(1)
})
