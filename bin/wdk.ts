#!/usr/bin/env node
import { run } from '../src/index.ts'

run(process.argv).catch((error: unknown) => {
  console.error(error)
  process.exit(2)
})
