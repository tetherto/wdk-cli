import { configService } from './config-service.js'
import { getSpendingRecord, recordSpending } from './spending-service.js'
import { convertToUsd } from './price-service.js'
import { WdkCliError } from '../errors/index.js'
import type { NetworkName } from '../types/index.js'
import type { SendOptions } from './transaction-service.js'

export interface PolicyConfig {
  enabled: boolean
  maxPerCallUsd: number
  maxPerDayUsd: number
  maxTxPerDay: number
  whitelist: string[]
}

const POLICY_DEFAULTS: PolicyConfig = {
  enabled: false,
  maxPerCallUsd: 0,
  maxPerDayUsd: 0,
  maxTxPerDay: 0,
  whitelist: [],
}

export class PolicyViolationError extends WdkCliError {
  constructor(message: string, suggestion?: string) {
    super(message, 'POLICY_VIOLATION', suggestion)
  }
}

export function getPolicy(): PolicyConfig {
  const stored = configService.get('policy') as Partial<PolicyConfig> | undefined
  return { ...POLICY_DEFAULTS, ...stored }
}

export function setPolicyValue(key: string, value: unknown): void {
  configService.set(`policy.${key}`, value)
}

export function addToWhitelist(address: string): void {
  const policy = getPolicy()
  const normalized = address.toLowerCase()
  if (!policy.whitelist.map((a) => a.toLowerCase()).includes(normalized)) {
    policy.whitelist.push(address)
    configService.set('policy.whitelist', policy.whitelist)
  }
}

export function removeFromWhitelist(address: string): void {
  const policy = getPolicy()
  const normalized = address.toLowerCase()
  const filtered = policy.whitelist.filter((a) => a.toLowerCase() !== normalized)
  configService.set('policy.whitelist', filtered)
}

export async function enforcePolicies(options: SendOptions): Promise<{ amountUsd: number }> {
  const policy = getPolicy()
  if (!policy.enabled) {
    return { amountUsd: 0 }
  }

  if (policy.whitelist.length > 0) {
    const toNormalized = options.to.toLowerCase()
    const allowed = policy.whitelist.some((a) => a.toLowerCase() === toNormalized)
    if (!allowed) {
      throw new PolicyViolationError(
        `Address ${options.to} is not in the whitelist.`,
        'Add it with: wdk policy whitelist add <address>',
      )
    }
  }

  let amountUsd: number
  try {
    amountUsd = await convertToUsd(
      options.network as NetworkName,
      BigInt(options.amount),
      options.token,
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new PolicyViolationError(
      `Cannot enforce spending limits: ${msg}`,
      'Use "wdk policy disable" to bypass policy checks.',
    )
  }

  if (policy.maxPerCallUsd > 0 && amountUsd > policy.maxPerCallUsd) {
    throw new PolicyViolationError(
      `Transaction of $${amountUsd.toFixed(2)} exceeds per-call limit of $${policy.maxPerCallUsd.toFixed(2)}.`,
    )
  }

  const spending = getSpendingRecord()

  if (policy.maxTxPerDay > 0 && spending.txCount >= policy.maxTxPerDay) {
    throw new PolicyViolationError(
      `Daily transaction limit reached (${policy.maxTxPerDay} transactions).`,
    )
  }

  if (policy.maxPerDayUsd > 0 && spending.totalUsd + amountUsd > policy.maxPerDayUsd) {
    throw new PolicyViolationError(
      `Transaction of $${amountUsd.toFixed(2)} would exceed daily limit of $${policy.maxPerDayUsd.toFixed(2)}. ` +
      `Already spent: $${spending.totalUsd.toFixed(2)}.`,
    )
  }

  return { amountUsd }
}

export function recordTransaction(
  options: SendOptions,
  txHash: string,
  amountUsd: number,
): void {
  const policy = getPolicy()
  if (!policy.enabled) return

  recordSpending({
    timestamp: Date.now(),
    network: options.network,
    to: options.to,
    amountUsd,
    token: options.token,
    txHash,
  })
}
