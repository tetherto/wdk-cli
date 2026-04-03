#!/usr/bin/env -S node --disable-warning=ExperimentalWarning

const ttl = parseInt(process.env.WDK_DAEMON_TTL || '30', 10)

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
    setTimeout(() => reject(new Error('Timed out waiting for password on stdin')), 5000)
  })
}

const password = await readStdin()

if (!password) {
  process.stderr.write('Error: No password provided on stdin\n')
  process.exit(1)
}

const { startDaemon } = await import('../dist/index.js')

startDaemon(password, ttl).catch((error) => {
  process.stderr.write(`Daemon error: ${error.message || error}\n`)
  process.exit(1)
})
