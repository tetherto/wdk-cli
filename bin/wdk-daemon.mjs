#!/usr/bin/env node

// Foreground launcher for the wallet daemon, for manual runs and debugging:
//
//   wdk-daemon
//
// The CLI normally starts the daemon itself (see src/daemon/client.js). Both
// paths run it under the Bare runtime via bare-runtime; this one keeps it in
// the foreground, forwards its exit code, and leaves Ctrl-C to the daemon.
import bareSpawn from 'bare-runtime/spawn'
import { writeBareLaunchFiles } from '../src/daemon/bare/imports.js'

const entry = await writeBareLaunchFiles()

bareSpawn('bare', {
  args: [entry],
  stdio: 'inherit',
  forwardExitCode: true,
  suppressSignals: true
})
