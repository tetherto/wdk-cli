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

import { z } from 'zod'
import { WdkCliError, ErrorCode } from '../errors/index.js'
import { VALID_WALLET_TYPES } from '../config/networks.js'

/**
 * Provider-specific identifiers stored on a token entry's `metadata`.
 */
const TokenMetadataSchema = z.object({
  indexerSlug: z.string().min(1).optional(),
  moonpaySlug: z.string().min(1).optional(),
  bitfinexSlug: z.string().min(1).optional()
})

/**
 * Base token entry shape (no parent-network context, no registry key).
 * Reused by the in-spec token entry schema below and — eventually — by the
 * standalone `validateTokenEntry`.
 */
const TokenEntryBase = z.object({
  symbol: z.string().min(1),
  decimals: z.number().int().min(0).max(24),
  isNative: z.boolean(),
  address: z.string().min(1).optional(),
  metadata: TokenMetadataSchema.optional()
})

/** Refine: non-native tokens must declare a contract / mint `address`. */
const nonNativeNeedsAddress = (t) => t.isNative || !!t.address
const nonNativeNeedsAddressIssue = {
  message: 'Non-native tokens require an "address"',
  path: ['address']
}

/**
 * Standalone token entry schema (e.g. an entry persisted under
 * `customTokens.<network>.<token>`). Used by `validateTokenEntry`.
 */
export const TokenEntrySchema = TokenEntryBase
  .refine(nonNativeNeedsAddress, nonNativeNeedsAddressIssue)

/**
 * Token spec accepted by `wdk token add <data>` — the entry plus its parent
 * network and registry key. Used by `validateTokenSpec`.
 */
export const TokenSpecSchema = TokenEntryBase.extend({
  network: z.string().min(1),
  token: z.string().min(1).transform((t) => t.toLowerCase())
}).refine(nonNativeNeedsAddress, nonNativeNeedsAddressIssue)

/**
 * Token entry as it appears inside `NetworkSpec.tokens[]` — adds the
 * registry key (`token`) and lowercases it.
 */
const TokenInNetworkSpecSchema = TokenEntryBase.extend({
  token: z.string().min(1).transform((t) => t.toLowerCase())
}).refine(nonNativeNeedsAddress, nonNativeNeedsAddressIssue)

/**
 * Schema for the JSON spec accepted by `wdk network create <data>`.
 * Unknown top-level fields pass through (`.passthrough()`) so users can
 * annotate their specs (`comment`, `tags`, etc.) without rejection.
 * `displayName` defaults to `network` via `.transform()`.
 */
export const NetworkSpecSchema = z.object({
  network: z.string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, '"network" must be lowercase alphanumeric with hyphens'),
  module: z.string().refine(
    (m) => VALID_WALLET_TYPES.includes(m),
    { message: `"module" must be one of: ${VALID_WALLET_TYPES.join(', ')}` }
  ),
  displayName: z.string().min(1).optional(),
  testnet: z.boolean().optional().default(false),
  indexerSlug: z.string().min(1).optional(),
  config: z.record(z.unknown()).optional(),
  tokens: z.array(TokenInNetworkSpecSchema)
    .refine(
      (arr) => new Set(arr.map((t) => t.token)).size === arr.length,
      { message: 'duplicate registry key(s)' }
    )
    .refine(
      (arr) => arr.filter((t) => t.isNative).length <= 1,
      { message: 'at most one native token per network' }
    )
    .optional()
})
  // Unknown top-level fields are silently dropped (lenient — supports user annotations).
  .transform((spec) => ({
    ...spec,
    displayName: spec.displayName ?? spec.network
  }))

/**
 * Runs `safeParse` on the given schema and translates `ZodError` into a
 * structured `WdkCliError`. Single error-formatting site for all spec
 * validators.
 *
 * - `invalid_type` at the root → `<label> must be a JSON object.`
 * - Error in `module` field   → `UNSUPPORTED_MODULE` error code
 * - Everything else           → `INVALID_ARGUMENT` error code
 *
 * @template {z.ZodTypeAny} TSchema
 * @param {TSchema} schema - The zod schema to apply.
 * @param {unknown} data - Untrusted JSON value (parsed from CLI input).
 * @param {string} label - Used in error messages (e.g. "Network spec").
 * @returns {z.output<TSchema>} The validated and normalised value.
 * @throws {WdkCliError} INVALID_ARGUMENT / UNSUPPORTED_MODULE on failure.
 */
export function parseSpec (schema, data, label) {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  if (issue.code === 'invalid_type' && issue.path.length === 0) {
    throw new WdkCliError(`${label} must be a JSON object.`, ErrorCode.INVALID_ARGUMENT)
  }
  const path = issue.path.length ? `"${issue.path.join('.')}"` : ''
  const code = issue.path[0] === 'module' ? ErrorCode.UNSUPPORTED_MODULE : ErrorCode.INVALID_ARGUMENT
  throw new WdkCliError(
    `${label}${path ? ` ${path}` : ''}: ${issue.message}`,
    code
  )
}
