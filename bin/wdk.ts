#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { run } from '../src/index.ts'

run(process.argv).catch((error: unknown) => {
  console.error(error)
  process.exit(2)
})
