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

import { walletsFile } from '../config/wdk-config.js'
import { getNetworkConfig, parseModuleName } from '../config/networks.js'
import { WdkCliError, ErrorCode } from '../errors/index.js'

/** @typedef {import('../config/wdk-config.js').MethodEntry} MethodEntry */
/** @typedef {import('../config/wdk-config.js').MethodParamType} MethodParamType */

/**
 * Converters from raw CLI argument strings to the values a wallet module
 * expects. Validation happens here so a malformed value never reaches the
 * module. `bigint` cannot cross the JSON IPC boundary, so the daemon runs
 * this conversion on its side of the socket.
 *
 * @type {Record<string, (raw: string, flag: string) => unknown>}
 */
const TYPE_CONVERTERS = {
  string: (raw, flag) => {
    if (raw === '') {
      throw new WdkCliError(`Invalid --${flag}: expected a non-empty string.`, ErrorCode.INVALID_ARGUMENT)
    }
    return raw
  },
  bigint: (raw, flag) => {
    if (!/^[0-9]+$/.test(raw)) {
      throw new WdkCliError(
        `Invalid --${flag}: expected an integer in base units (e.g. sats).`,
        ErrorCode.INVALID_AMOUNT
      )
    }
    return BigInt(raw)
  },
  number: (raw, flag) => {
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      throw new WdkCliError(`Invalid --${flag}: expected a number.`, ErrorCode.INVALID_ARGUMENT)
    }
    return value
  },
  boolean: (raw, flag) => {
    if (raw !== 'true' && raw !== 'false') {
      throw new WdkCliError(`Invalid --${flag}: expected true or false.`, ErrorCode.INVALID_ARGUMENT)
    }
    return raw === 'true'
  }
}

/**
 * Converts a raw string to a scalar value of the given base type.
 *
 * @param {string} base - The scalar base type (e.g. "bigint").
 * @param {string} raw - The raw value string.
 * @param {string} flag - The CLI flag name used in error messages.
 * @returns {unknown} The converted value.
 * @throws {WdkCliError} When the type is unsupported or the value is malformed.
 */
function convertScalar (base, raw, flag) {
  const convert = TYPE_CONVERTERS[base]
  if (!convert) {
    throw new WdkCliError(`Unsupported parameter type '${base}' for --${flag}.`, ErrorCode.INVALID_ARGUMENT)
  }
  return convert(raw, flag)
}

/**
 * Converts a comma-separated string to a typed array of the given scalar
 * array type (e.g. "string[]", "bigint[]").
 *
 * @param {string} base - The scalar array type.
 * @param {string} raw - The raw comma-separated string.
 * @param {string} flag - The CLI flag name used in error messages.
 * @returns {unknown[]} The converted values.
 * @throws {WdkCliError} When the list is empty or an item is malformed.
 */
function convertScalarList (base, raw, flag) {
  const items = raw.split(',').map((v) => v.trim()).filter((v) => v !== '')
  if (items.length === 0) {
    throw new WdkCliError(`Invalid --${flag}: expected a comma-separated list.`, ErrorCode.INVALID_ARGUMENT)
  }
  return items.map((item) => convertScalar(base.slice(0, -2), item, flag))
}

/**
 * Converts a camelCase parameter name to its kebab-case CLI flag name.
 *
 * @param {string} param - The parameter name (e.g. "maxFee").
 * @returns {string} The flag name without dashes (e.g. "max-fee").
 */
export function paramToFlag (param) {
  return param.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/**
 * Converts a kebab-case CLI flag name to its camelCase parameter name.
 *
 * @param {string} flag - The flag name without dashes (e.g. "max-fee").
 * @returns {string} The parameter name (e.g. "maxFee").
 */
function flagToParam (flag) {
  return flag.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
}

/**
 * Parses leftover CLI tokens into raw method-argument strings. Every flag must
 * be followed by a value (booleans included: pass `--fast true` / `--fast false`);
 * a flag with no value is a mistake and throws. Whether a param may be omitted
 * is decided later, by its declared optionality, not here.
 *
 * @param {string[]} tokens - Unparsed CLI tokens (e.g. ["--txid", "abc"]).
 * @returns {Record<string, string>} Raw argument strings keyed by parameter name.
 * @throws {WdkCliError} When a token is not a flag, or a flag has no value.
 */
export function parseMethodArgs (tokens) {
  /** @type {Record<string, string>} */
  const args = {}
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token.startsWith('--')) {
      throw new WdkCliError(`Unexpected argument '${token}'.`, ErrorCode.INVALID_ARGUMENT)
    }
    const flag = token.slice(2)
    const next = tokens[i + 1]
    if (next === undefined || next.startsWith('--')) {
      throw new WdkCliError(`Missing value for --${flag}.`, ErrorCode.INVALID_ARGUMENT)
    }
    args[flagToParam(flag)] = next
    i++
  }
  return args
}

/**
 * Splits a catalog param type into its base type and optionality.
 *
 * @param {string} type - The declared type (e.g. "bigint?").
 * @returns {{ base: string, optional: boolean }} The base type and whether the param is optional.
 */
function parseType (type) {
  const optional = type.endsWith('?')
  return { base: optional ? type.slice(0, -1) : type, optional }
}

/**
 * Returns the methods declared for the wallet module that backs a network.
 *
 * @param {string} network - The network name.
 * @returns {Record<string, MethodEntry>} Methods keyed by name (empty when none declared).
 * @throws {WdkCliError} When the network is not supported.
 */
export function getModuleMethods (network) {
  const pkg = parseModuleName(getNetworkConfig(network).module).name
  return walletsFile.modules?.[pkg]?.methods || {}
}

/**
 * Returns every module in the catalog that declares methods.
 *
 * @returns {Record<string, Record<string, MethodEntry>>} Methods keyed by package name.
 */
export function getAllModuleMethods () {
  /** @type {Record<string, Record<string, MethodEntry>>} */
  const result = {}
  for (const [pkg, entry] of Object.entries(walletsFile.modules || {})) {
    if (entry.methods && Object.keys(entry.methods).length > 0) {
      result[pkg] = entry.methods
    }
  }
  return result
}

/**
 * Looks up a declared method by name for a network's wallet module.
 *
 * @param {string} network - The network name.
 * @param {string} name - The method name.
 * @returns {MethodEntry} The method entry.
 * @throws {WdkCliError} When the method is not declared for the module.
 */
export function getMethod (network, name) {
  const methods = getModuleMethods(network)
  const method = methods[name]
  if (!method) {
    const available = Object.keys(methods)
    throw new WdkCliError(
      `Unknown method '${name}' for network '${network}'.`,
      ErrorCode.INVALID_ARGUMENT,
      available.length > 0
        ? `Available methods: ${available.join(', ')}`
        : `The wallet module for '${network}' declares no methods.`
    )
  }
  return method
}

/**
 * Validates raw argument strings against a method's parameter schema
 * without converting them, so they can travel as strings over the IPC socket.
 *
 * @param {MethodEntry} method - The method entry.
 * @param {Record<string, string>} rawArgs - Raw argument strings keyed by parameter name.
 * @returns {void}
 * @throws {WdkCliError} When an argument is unknown, missing, or malformed.
 */
export function validateMethodArgs (method, rawArgs) {
  convertMethodArgs(method, rawArgs)
}

/**
 * Marshals a scalar (or scalar-array) node that came from parsed JSON, where
 * numbers and booleans may already carry their native runtime type.
 *
 * @param {string} type - The scalar type string (e.g. "bigint?", "string[]").
 * @param {unknown} value - The parsed JSON value.
 * @param {string} flag - The top-level CLI flag name used in error messages.
 * @returns {unknown} The marshalled value.
 * @throws {WdkCliError} When the value cannot be marshalled.
 */
function marshalScalarNode (type, value, flag) {
  const { base } = parseType(type)
  if (base.endsWith('[]')) {
    if (Array.isArray(value)) {
      return value.map((item) => marshalScalarNode(base.slice(0, -2), item, flag))
    }
    if (typeof value === 'string') {
      return convertScalarList(base, value, flag)
    }
  } else {
    if (base === 'number' && typeof value === 'number' && Number.isFinite(value)) return value
    if (base === 'boolean' && typeof value === 'boolean') return value
    if (typeof value === 'string') {
      return convertScalar(base, value, flag)
    }
  }
  throw new WdkCliError(`Invalid --${flag}: expected ${base}.`, ErrorCode.INVALID_ARGUMENT)
}

/**
 * Marshals a parsed JSON value against a declared type, recursing into object
 * schemas and arrays. `bigint` values inside JSON must be strings so amounts
 * never pass through a JSON number.
 *
 * @param {MethodParamType} type - The declared type.
 * @param {unknown} value - The parsed JSON value.
 * @param {string} flag - The top-level CLI flag name used in error messages.
 * @returns {unknown} The marshalled value.
 * @throws {WdkCliError} When the value cannot be marshalled.
 */
function marshalNode (type, value, flag) {
  if (typeof type === 'string') {
    return marshalScalarNode(type, value, flag)
  }

  if (Array.isArray(type)) {
    if (!Array.isArray(value)) {
      throw new WdkCliError(`Invalid --${flag}: expected a JSON array.`, ErrorCode.INVALID_ARGUMENT)
    }
    const elementType = /** @type {MethodParamType} */ (type[0])
    return value.map((item) => marshalNode(elementType, item, flag))
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new WdkCliError(`Invalid --${flag}: expected a JSON object.`, ErrorCode.INVALID_ARGUMENT)
  }
  const record = /** @type {Record<string, unknown>} */ (value)
  for (const key of Object.keys(record)) {
    if (!(key in type)) {
      throw new WdkCliError(`Unknown field '${key}' in --${flag}.`, ErrorCode.INVALID_ARGUMENT)
    }
  }
  /** @type {Record<string, unknown>} */
  const result = {}
  for (const [field, fieldType] of Object.entries(type)) {
    const typed = /** @type {MethodParamType} */ (fieldType)
    const fieldValue = record[field]
    if (fieldValue === undefined) {
      const optional = typeof typed === 'string' && parseType(typed).optional
      if (!optional) {
        throw new WdkCliError(`Missing required field '${field}' in --${flag}.`, ErrorCode.INVALID_ARGUMENT)
      }
      continue
    }
    result[field] = marshalNode(typed, fieldValue, flag)
  }
  return result
}

/**
 * Marshals one raw argument string into the runtime value its declared type
 * requires. Scalar types convert directly; structured types (object schemas
 * and arrays of them) take a JSON string.
 *
 * @param {MethodParamType} type - The declared type.
 * @param {string} raw - The raw argument string.
 * @param {string} flag - The CLI flag name used in error messages.
 * @returns {unknown} The marshalled value.
 * @throws {WdkCliError} When the value cannot be marshalled.
 */
function marshalParam (type, raw, flag) {
  if (typeof type === 'string') {
    const { base } = parseType(type)
    if (base.endsWith('[]')) {
      return convertScalarList(base, raw, flag)
    }
    return convertScalar(base, raw, flag)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new WdkCliError(`Invalid --${flag}: expected JSON.`, ErrorCode.INVALID_ARGUMENT)
  }
  return marshalNode(type, parsed, flag)
}

/**
 * Converts raw argument strings into the argument list for the module method
 * call. Positional methods (the default) get one typed value per parameter in
 * schema order, with trailing optional parameters omitted; object-style
 * methods get a single options object holding the provided parameters.
 *
 * @param {MethodEntry} method - The method entry.
 * @param {Record<string, string>} rawArgs - Raw argument strings keyed by parameter name.
 * @returns {unknown[]} The converted arguments, ready to spread into the call.
 * @throws {WdkCliError} When an argument is unknown, missing, or malformed.
 */
export function convertMethodArgs (method, rawArgs) {
  for (const param of Object.keys(rawArgs)) {
    if (!(param in method.params)) {
      throw new WdkCliError(`Unknown parameter --${paramToFlag(param)}.`, ErrorCode.INVALID_ARGUMENT)
    }
  }

  /** @type {unknown[]} */
  const values = []
  /** @type {Record<string, unknown>} */
  const options = {}
  for (const [param, type] of Object.entries(method.params)) {
    const raw = rawArgs[param]
    if (raw === undefined) {
      const optional = typeof type === 'string' && parseType(type).optional
      if (!optional) {
        throw new WdkCliError(`Missing required parameter --${paramToFlag(param)}.`, ErrorCode.INVALID_ARGUMENT)
      }
      values.push(undefined)
      continue
    }
    const value = marshalParam(type, raw, paramToFlag(param))
    values.push(value)
    options[param] = value
  }

  if (method.style === 'object') {
    return [options]
  }

  while (values.length > 0 && values[values.length - 1] === undefined) {
    values.pop()
  }
  return values
}

/**
 * Renders a method's parameter schema as CLI flag usage.
 *
 * @param {MethodEntry} method - The method entry.
 * @returns {string} A usage string (e.g. "Params: --txid <string> [--max-fee <bigint>]").
 */
export function describeParams (method) {
  const parts = []
  for (const [param, type] of Object.entries(method.params)) {
    if (typeof type !== 'string') {
      parts.push(`--${paramToFlag(param)} <json>`)
      continue
    }
    const { base, optional } = parseType(type)
    const usage = `--${paramToFlag(param)} <${base}>`
    parts.push(optional ? `[${usage}]` : usage)
  }
  if (parts.length === 0) return 'None'
  return `Params: ${parts.join(' ')}`
}

/**
 * Splits a method's parameters into required and optional CLI flag usages,
 * so a listing can show each group in its own column. Structured (JSON)
 * parameters are always required.
 *
 * @param {MethodEntry} method - The method entry.
 * @returns {{ required: string[], optional: string[] }} Flag usage strings by group.
 */
export function splitParamUsage (method) {
  /** @type {{ required: string[], optional: string[] }} */
  const groups = { required: [], optional: [] }
  for (const [param, type] of Object.entries(method.params)) {
    if (typeof type !== 'string') {
      groups.required.push(`--${paramToFlag(param)} <json>`)
      continue
    }
    const { base, optional } = parseType(type)
    const usage = `--${paramToFlag(param)} <${base}>`
    groups[optional ? 'optional' : 'required'].push(usage)
  }
  return groups
}

/**
 * JSON.stringify replacer that serializes BigInt values as decimal strings,
 * so module results survive the JSON IPC boundary.
 *
 * @param {string} _key - The property key (unused).
 * @param {unknown} value - The property value.
 * @returns {unknown} The value, with BigInt converted to string.
 */
export function bigintReplacer (_key, value) {
  return typeof value === 'bigint' ? value.toString() : value
}
