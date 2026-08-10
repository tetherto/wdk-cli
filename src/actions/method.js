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

import { daemonClient } from '../daemon/client.js'
import {
  getModuleMethods,
  getAllModuleMethods,
  getMethod,
  validateMethodArgs
} from '../services/methods.js'

/** @typedef {import('../config/wdk-config.js').MethodEntry} MethodEntry */
/** @typedef {import('../config/wdk-config.js').MethodParamType} MethodParamType */

/**
 * @typedef {Object} MethodInfo
 * @property {string} name - The method name.
 * @property {'read' | 'write'} kind - Whether the method mutates state.
 * @property {Record<string, MethodParamType>} params - Parameter name to type (a trailing `?` marks it optional).
 */

/**
 * Maps a methods record to a list of method infos.
 *
 * @param {Record<string, MethodEntry>} methods - Methods keyed by name.
 * @returns {MethodInfo[]} The method list.
 */
function toMethodList (methods) {
  return Object.entries(methods).map(([name, method]) => ({
    name,
    kind: method.kind,
    params: method.params
  }))
}

/**
 * @typedef {Object} ListMethodsInput
 * @property {string} network - The blockchain network name.
 */

/**
 * @typedef {Object} ListMethodsResult
 * @property {string} network - The blockchain network name.
 * @property {MethodInfo[]} methods - The methods declared by the network's wallet module.
 */

/**
 * Lists the methods declared by a network's wallet module.
 *
 * @param {ListMethodsInput} input - The lookup parameters.
 * @returns {ListMethodsResult} The declared methods.
 */
export function listMethods (input) {
  const methods = getModuleMethods(input.network)
  return { network: input.network, methods: toMethodList(methods) }
}

/**
 * @typedef {Object} ModuleMethods
 * @property {string} module - The module package name.
 * @property {MethodInfo[]} methods - The methods declared by the module.
 */

/**
 * @typedef {Object} ListAllMethodsResult
 * @property {ModuleMethods[]} modules - Every module that declares methods.
 */

/**
 * Lists the declared methods of every module in the catalog.
 *
 * @returns {ListAllMethodsResult} The declared methods grouped by module.
 */
export function listAllMethods () {
  const byModule = getAllModuleMethods()
  const modules = Object.entries(byModule).map(([module, methods]) => ({
    module,
    methods: toMethodList(methods)
  }))
  return { modules }
}

/**
 * @typedef {Object} CallMethodInput
 * @property {string} network - The blockchain network name.
 * @property {string} name - The method name.
 * @property {Record<string, string>} [args] - Raw argument strings keyed by parameter name.
 * @property {number} index - The BIP-44 account index.
 * @property {string} [wallet] - The wallet name (defaults to the active wallet).
 */

/**
 * @typedef {Object} CallMethodResult
 * @property {string} network - The blockchain network name.
 * @property {string} method - The invoked method name.
 * @property {unknown} result - The method result (BigInt values serialized as strings, undefined as null).
 */

/**
 * Invokes a catalog-declared method of a network's wallet module.
 *
 * @param {CallMethodInput} input - The call parameters.
 * @returns {Promise<CallMethodResult>} The method result.
 */
export async function callMethod (input) {
  const method = getMethod(input.network, input.name)
  const args = input.args || {}
  validateMethodArgs(method, args)
  const wallet = await daemonClient.requireUnlocked(input.wallet)
  const result = await daemonClient.callMethod(input.network, input.name, args, input.index, wallet)
  return { network: input.network, method: input.name, result }
}
