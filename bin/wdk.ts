#!/usr/bin/env -S node --disable-warning=ExperimentalWarning --disable-warning=DeprecationWarning

import { run } from '../src/index.ts'

run(process.argv).then(() => {
  process.exit(0)
}).catch((error: unknown) => {
  console.error(error)
  process.exit(2)
})
