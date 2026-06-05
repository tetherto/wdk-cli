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

import chalk from 'chalk'
import {
  listTokens,
  getToken,
  addToken,
  deleteToken,
  validateTokenSpec
} from '../actions/token.js'
import { getTokenSource } from '../services/token-service.js'
import { validateNetwork } from '../config/networks.js'
import { WdkCliError, ErrorCode, handleError } from '../errors/index.js'
import { configureHelp } from '../ui/help.js'
import { requirePassphraseConfirmation } from '../ui/auth.js'
import { createTable } from '../ui/tables.js'
import { formatAddress } from '../ui/formatters.js'
import { loadJson } from '../ui/parsers.js'

/** @typedef {import('commander').Command} Command */
/** @typedef {import('../config/wdk-tokens.js').TokenEntry} TokenEntry */

/**
 * Renders a token entry as aligned key/value lines (used by `info`).
 *
 * @param {TokenEntry} entry
 * @param {string} token
 * @returns {void}
 */
function printTokenEntry (entry, token) {
  console.log(`  ${chalk.bold(token)}`)
  console.log(`    Symbol:   ${entry.symbol}`)
  console.log(`    Decimals: ${entry.decimals}`)
  console.log(`    Native:   ${entry.isNative ? 'yes' : 'no'}`)
  if (entry.address) console.log(`    Address:  ${entry.address}`)
  if (entry.metadata) {
    const metaLine = Object.entries(entry.metadata)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
    if (metaLine) console.log(`    Metadata: ${metaLine}`)
  }
}

/**
 * Builds a single table row for a token entry.
 *
 * Common columns: Token, Symbol, Decimals, Native, Address.
 * Provider metadata: Indexer, MoonPay, Bitfinex.
 * Final column: Source (built-in vs custom).
 *
 * @param {string} network
 * @param {string} token
 * @param {TokenEntry} entry
 * @returns {string[]} Cells in the order defined by COMMON_COLUMNS.
 */
function tokenRow (network, token, entry) {
  const source = getTokenSource(network, token)
  return [
    chalk.bold(token),
    entry.symbol,
    String(entry.decimals),
    entry.isNative ? 'yes' : '',
    entry.address ? formatAddress(entry.address, true) : chalk.dim('—'),
    entry.metadata?.indexerSlug ?? chalk.dim('—'),
    entry.metadata?.moonpaySlug ?? chalk.dim('—'),
    entry.metadata?.bitfinexSlug ?? chalk.dim('—'),
    source === 'custom' ? chalk.yellow('custom') : chalk.dim('built-in')
  ]
}

const COMMON_COLUMNS = [
  'Token',
  'Symbol',
  'Decimals',
  'Native',
  'Address',
  'Indexer',
  'MoonPay',
  'Bitfinex',
  'Source'
]

/**
 * Renders tokens for a single network as a table (no Network column).
 *
 * @param {string} network
 * @param {Record<string, TokenEntry>} tokens
 * @returns {void}
 */
function printSingleNetworkTable (network, tokens) {
  console.log()
  console.log(chalk.bold(`  ${network}:`))
  const table = createTable(COMMON_COLUMNS)
  for (const [token, entry] of Object.entries(tokens)) {
    table.push(tokenRow(network, token, entry))
  }
  console.log(table.toString())
}

/**
 * Renders every network's tokens in one combined table so all columns share
 * the same widths. Network is the leading column.
 *
 * @param {Record<string, Record<string, TokenEntry>>} byNetwork
 * @returns {{ totalNetworks: number, totalTokens: number }}
 */
function printCombinedTable (byNetwork) {
  console.log()
  const table = createTable(['Network', ...COMMON_COLUMNS])
  let totalNetworks = 0
  let totalTokens = 0
  for (const [network, tokens] of Object.entries(byNetwork)) {
    if (Object.keys(tokens).length === 0) continue
    totalNetworks++
    for (const [token, entry] of Object.entries(tokens)) {
      totalTokens++
      table.push([chalk.dim(network), ...tokenRow(network, token, entry)])
    }
  }
  console.log(table.toString())
  return { totalNetworks, totalTokens }
}

/**
 * Registers the `token` subcommand tree (list, info, add, delete) on the root program.
 *
 * @param {Command} program - The root Commander program instance.
 * @returns {void}
 */
export function registerTokenCommand (program) {
  const token = program.command('token').description('Manage token registry entries')

  configureHelp(token, {})

  // ─── list ───────────────────────────────────────────────────────────────
  const listCmd = token
    .command('list')
    .description('List registered tokens (omit --network for every network)')
    .option('--network <network>', 'Filter to a single network')

  configureHelp(listCmd, {
    params: [{ flags: '--network <network>', description: 'Filter to a single network' }]
  })

  listCmd.action((options) => {
    try {
      const result = listTokens({ network: options.network })

      if (program.opts().json) {
        console.log(JSON.stringify(result))
        return
      }

      if ('network' in result) {
        if (Object.keys(result.tokens).length === 0) {
          console.log(chalk.yellow(`No tokens registered for '${result.network}'.`))
          return
        }
        printSingleNetworkTable(result.network, result.tokens)
        console.log()
        return
      }

      const { totalNetworks, totalTokens } = printCombinedTable(result.tokens)
      console.log(chalk.dim(`\n  ${totalTokens} tokens across ${totalNetworks} networks`))
      console.log()
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  // ─── info ───────────────────────────────────────────────────────────────
  const infoCmd = token
    .command('info')
    .description('Show details for a single token entry')
    .requiredOption('--network <network>', 'Network the token belongs to')
    .requiredOption('--token <token>', 'Token (e.g. usdt)')

  configureHelp(infoCmd, {
    params: [
      { flags: '--network <network>', description: 'Network the token belongs to', required: true },
      { flags: '--token <token>', description: 'Token (e.g. usdt)', required: true }
    ]
  })

  infoCmd.action((options) => {
    try {
      const result = getToken({ network: options.network, token: options.token })

      if (program.opts().json) {
        console.log(JSON.stringify(result))
        return
      }
      console.log()
      console.log(chalk.bold(`  ${result.network}:`))
      const { network: _n, token, ...entry } = result
      printTokenEntry(/** @type {TokenEntry} */ (entry), token)
      console.log()
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  // ─── add ────────────────────────────────────────────────────────────────
  const addCmd = token
    .command('add')
    .description('Add or override a token entry from a JSON spec (inline or file path)')
    .argument('<data>', 'JSON string or path to JSON file')

  configureHelp(addCmd, {
    args: [
      { flags: '<data>', description: 'JSON string or path to JSON file', required: true }
    ]
  })

  addCmd.action(async (dataArg) => {
    try {
      const spec = validateTokenSpec(loadJson(dataArg, '<data>'))
      const { network, token: ticker, entry } = spec
      validateNetwork(network)

      await requirePassphraseConfirmation()

      const result = addToken({ network, token: ticker, entry })

      if (program.opts().json) {
        console.log(JSON.stringify(result))
        return
      }
      console.log(chalk.green(`Token '${result.token}' added on '${result.network}'.`))
      if (result.overridesBuiltin) {
        console.log(
          chalk.yellow(
            `  Warning: '${result.token}' is a built-in token on '${result.network}'. ` +
              'This entry now overrides it. Run `wdk token delete` to revert.'
          )
        )
      }
      console.log()
      console.log(chalk.bold(`  ${result.network}:`))
      const { network: _n, token, added: _a, overridesBuiltin: _o, ...entryFields } = result
      printTokenEntry(/** @type {TokenEntry} */ (entryFields), token)
      console.log()
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })

  // ─── delete ─────────────────────────────────────────────────────────────
  const deleteCmd = token
    .command('delete')
    .description('Delete a custom token entry (built-in entries cannot be deleted)')
    .requiredOption('--network <network>', 'Network the token belongs to')
    .requiredOption('--token <token>', 'Token to delete')

  configureHelp(deleteCmd, {
    params: [
      { flags: '--network <network>', description: 'Network the token belongs to', required: true },
      { flags: '--token <token>', description: 'Token to delete', required: true }
    ]
  })

  deleteCmd.action(async (options) => {
    try {
      const { network, token } = options
      validateNetwork(network)

      const source = getTokenSource(network, token)
      if (!source) {
        throw new WdkCliError(
          `Token '${token}' not found on '${network}'.`,
          ErrorCode.TOKEN_NOT_SUPPORTED
        )
      }
      if (source === 'built-in') {
        throw new WdkCliError(
          `'${token}' on '${network}' is a built-in token and cannot be deleted.`,
          ErrorCode.INVALID_ARGUMENT,
          'Use `wdk token add` to override its fields instead.'
        )
      }

      await requirePassphraseConfirmation()

      const result = deleteToken({ network, token })

      if (program.opts().json) {
        console.log(JSON.stringify(result))
      } else {
        console.log(chalk.green(`Token '${result.token}' deleted on '${result.network}'.`))
        if (result.revertedToBuiltin) {
          console.log(chalk.dim('  Reverted to built-in.'))
        }
      }
    } catch (error) {
      handleError(error, program.opts().verbose, program.opts().json)
    }
  })
}
