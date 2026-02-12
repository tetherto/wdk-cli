#!/usr/bin/env node
import { run } from '../src/index.js'

run(process.argv).catch((error) => {
  console.error(error)
  process.exit(2)
})
