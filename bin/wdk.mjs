#!/usr/bin/env -S node --disable-warning=ExperimentalWarning

const { run } = await import('../src/index.js')

run(process.argv)
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(2)
  })
