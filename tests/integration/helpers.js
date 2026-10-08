// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BIN = join(CLI_ROOT, 'bin', 'wdk.mjs')
const DAEMON = join(CLI_ROOT, 'bin', 'wdk-daemon.mjs')

/**
 * How long a single command may take before the harness kills it. Every timeout
 * inside the CLI is well under this, so exceeding it means the process wedged.
 * Kept below jest's own timeout so the failure names the command that hung.
 */
const RUN_TIMEOUT_MS = 45_000

/**
 * @typedef {Object} CliResult
 * @property {number} code - The process exit code.
 * @property {string} stdout - Everything written to stdout, ANSI stripped.
 * @property {string} stderr - Everything written to stderr, ANSI stripped.
 * @property {string} output - stdout and stderr joined, for matching a message
 *   without caring which stream carried it.
 * @property {NodeJS.Signals | null} signal - The signal that killed the process,
 *   or `null` when it exited on its own.
 */

/** Matches the ANSI colour codes chalk writes when stdout is a TTY. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/**
 * Reports whether a pid is still one of this harness's daemons. A pid file
 * outlives the process it names and the system reuses pids, so a bare kill can
 * reach an unrelated process.
 *
 * @param {number} pid - The pid read from the daemon pid file.
 * @returns {boolean} True when that process is running the daemon script.
 */
function isOurDaemon (pid) {
  try {
    const command = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })
    return command.includes(DAEMON)
  } catch {
    // No such process, or `ps` is unavailable: either way, do not signal it.
    return false
  }
}

/**
 * An isolated CLI installation: its own config directory, torn down by
 * {@link Cli#cleanup}. A directory with no wallets means no passphrase prompt,
 * so every registry and config command runs unattended.
 *
 * The daemon socket lives inside that directory, so instances never share one
 * and these suites run in parallel. Windows is the exception: the daemon uses a
 * single fixed named pipe there, so workers would contend for it — run with
 * `--runInBand` on Windows until the pipe is per-directory too.
 */
export class Cli {
  /** The config directory this instance runs against. */
  configHome
  /** A throwaway home directory, so nothing can reach the real one. */
  home
  /** The passphrase every wallet in this instance is created with. */
  passphrase

  constructor () {
    this.configHome = mkdtempSync(join(tmpdir(), 'wdk-it-'))
    // `mcp setup` and friends resolve paths from homedir(), not XDG_CONFIG_HOME,
    // so without this they would edit the developer's own AI-tool config.
    this.home = mkdtempSync(join(tmpdir(), 'wdk-home-'))
    // Generated per instance and thrown away with the directory: these wallets
    // exist only for the length of one test file.
    this.passphrase = `pw-${randomBytes(12).toString('hex')}`
  }

  /**
   * Runs one `wdk` command to completion.
   *
   * @param {string[]} args - Arguments after the binary name.
   * @param {Object} [options] - Run options.
   * @param {string} [options.stdin] - Text to write to stdin, for the
   *   `--*-stdin` flags.
   * @param {boolean} [options.unlocked] - Pass the instance passphrase through
   *   `WDK_PASSPHRASE`, the documented way to run wallet commands unattended.
   * @param {string} [options.passphrase] - Use this passphrase instead of the
   *   instance one, for a wallet whose passphrase has been changed.
   * @returns {Promise<CliResult>} What the command printed and exited with.
   * @throws {Error} When the CLI binary cannot be spawned.
   * @throws {Error} When the command does not exit within the harness timeout.
   */
  run (args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [BIN, ...args], {
        env: {
          ...process.env,
          HOME: this.home,
          XDG_CONFIG_HOME: this.configHome,
          WDK_PASSPHRASE: options.passphrase ?? (options.unlocked ? this.passphrase : undefined),
          NO_COLOR: '1',
          NODE_OPTIONS: '--disable-warning=ExperimentalWarning'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      })

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(
          `wdk ${args.join(' ')} did not exit within ${RUN_TIMEOUT_MS}ms\n` +
          `stdout so far: ${stdout}\nstderr so far: ${stderr}`
        ))
      }, RUN_TIMEOUT_MS)

      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => { stdout += d })
      child.stderr.on('data', (d) => { stderr += d })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code, signal) => {
        clearTimeout(timer)
        const clean = (s) => s.replace(ANSI, '')
        resolve({
          // A signal kill reports a null code; 0 would read as success.
          code: code ?? (signal ? 1 : 0),
          signal,
          stdout: clean(stdout),
          stderr: clean(stderr),
          output: clean(stdout + stderr)
        })
      })

      if (options.stdin !== undefined) child.stdin.write(options.stdin)
      child.stdin.end()
    })
  }

  /**
   * Runs a command with `--json` and parses the object it prints.
   *
   * @param {string[]} args - Arguments after the binary name.
   * @param {Object} [options] - Run options, as {@link Cli#run} takes them.
   * @returns {Promise<Record<string, unknown>>} The parsed payload.
   * @throws {Error} When the command printed something other than one JSON object.
   */
  async json (args, options = {}) {
    const result = await this.run([...args, '--json'], options)
    const line = result.stdout.trim().split('\n').filter(Boolean).pop()
    if (line === undefined) throw new Error(`no JSON on stdout: ${result.output}`)
    try {
      return JSON.parse(line)
    } catch {
      throw new Error(`stdout was not JSON: ${result.output}`)
    }
  }

  /**
   * Reads the persisted user config.
   *
   * @returns {Record<string, unknown>} The parsed config file, or `{}` before
   *   the CLI has written one.
   */
  readConfig () {
    try {
      return JSON.parse(readFileSync(this.configPath(), 'utf8'))
    } catch {
      return {}
    }
  }

  /**
   * Replaces the persisted user config, for states the CLI refuses to create —
   * a second provider of a single-instance kind, say.
   *
   * @param {Record<string, unknown>} config - The config to write.
   * @returns {void}
   */
  writeConfig (config) {
    mkdirSync(dirname(this.configPath()), { recursive: true })
    writeFileSync(this.configPath(), JSON.stringify(config, null, 2))
  }

  /**
   * Returns the path of the persisted user config.
   *
   * @returns {string} Absolute path to `config.json`.
   */
  configPath () {
    return join(this.configHome, 'wdk-cli', 'config.json')
  }

  /**
   * Stops the daemon this instance started, then removes its config directory.
   * Without the kill each instance leaves a daemon holding a socket, and a
   * suite's worth of them starves the next test of resources.
   *
   * @returns {void}
   */
  cleanup () {
    try {
      const pid = Number(readFileSync(join(this.configHome, 'wdk-cli', 'daemon.pid'), 'utf8').trim())
      if (pid > 0 && isOurDaemon(pid)) process.kill(pid, 'SIGTERM')
    } catch {
      // No daemon was started, or it is already gone.
    }
    rmSync(this.configHome, { recursive: true, force: true })
    rmSync(this.home, { recursive: true, force: true })
  }
}
