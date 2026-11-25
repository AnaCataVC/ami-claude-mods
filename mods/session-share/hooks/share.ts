import type { SessionRateLimit, TurnUsage } from 'claude-code'
import type { SessionShareLedger, WindowLedger } from '../types'

export const FIVE_HOUR_WINDOW = 'five_hour'
export const SEVEN_DAY_WINDOW = 'seven_day'
const TRACKED_WINDOWS = [FIVE_HOUR_WINDOW, SEVEN_DAY_WINDOW] as const

export type WindowKind = (typeof TRACKED_WINDOWS)[number]

export type WindowShare = {
  kind: WindowKind
  /** Percentage of currently consumed quota in this window that was spent by the current session (0–100). */
  sharePercent: number
  /** Quota points consumed by this session in the window. */
  sessionUsed: number
  /** Total quota points consumed across the account in the window. */
  totalUsed: number
}

export type SessionShareSnapshot = {
  fiveHour?: WindowShare
  sevenDay?: WindowShare
}

export function emptyLedger(): SessionShareLedger {
  return {
    windows: {},
    mainTokensSinceMeasure: 0,
    subagentTokensSinceMeasure: 0,
    isMainTurnActive: false,
  }
}

/**
 * Total weighted token footprint of a turn from TurnUsage.
 * Uncached input, cache writes, and output tokens drive quota consumption; cache reads are weighted at 10%.
 */
export function turnTokenWeight(usage: TurnUsage | undefined | null): number {
  if (!usage) return 0
  const uncachedInput = Math.max(0, usage.input_tokens ?? 0)
  const cacheCreate = Math.max(0, usage.cache_creation_input_tokens ?? 0)
  const cacheRead = Math.max(0, usage.cache_read_input_tokens ?? 0) * 0.1
  const output = Math.max(0, usage.output_tokens ?? 0)
  return uncachedInput + cacheCreate + cacheRead + output
}

export function recordTurnStart(ledger: SessionShareLedger, agentId: string | undefined): SessionShareLedger {
  if (agentId !== undefined) return ledger
  return {
    ...ledger,
    isMainTurnActive: true,
  }
}

export function recordTurnComplete(
  ledger: SessionShareLedger,
  agentId: string | undefined,
  usage: TurnUsage | undefined | null,
): SessionShareLedger {
  const weight = turnTokenWeight(usage)
  if (agentId === undefined) {
    return {
      ...ledger,
      // Give a minimum weight of 1 when a main turn completes so main activity is always recognized even if usage is omitted.
      mainTokensSinceMeasure: ledger.mainTokensSinceMeasure + (weight > 0 ? weight : 1),
    }
  }
  return {
    ...ledger,
    subagentTokensSinceMeasure: ledger.subagentTokensSinceMeasure + (weight > 0 ? weight : 1),
  }
}

/**
 * Computes the fraction [0, 1] of a rate-limit delta that belongs to the current main session
 * (excluding nested child sessions in other processes and in-process subagents).
 */
export function mainAttributionRatio(ledger: SessionShareLedger): number {
  const main = ledger.mainTokensSinceMeasure
  const sub = ledger.subagentTokensSinceMeasure
  if (main > 0 || sub > 0) {
    return main / (main + sub)
  }
  // If no turn.complete usage was recorded yet, credit the delta only if this session's main turn was active.
  return ledger.isMainTurnActive ? 1 : 0
}

function updateWindowLedger(
  prev: WindowLedger | undefined,
  limit: SessionRateLimit,
  attributionRatio: number,
): WindowLedger {
  const currentUsed = Math.max(0, limit.percentUsed)
  if (!prev) {
    // Baseline reading when the session starts (or when a window first appears).
    return {
      lastPercentUsed: currentUsed,
      sessionUsed: 0,
      resetsAt: limit.resetsAt,
    }
  }

  // Detect window reset: either resetsAt timestamp changed or percentUsed dropped significantly.
  const windowReset =
    (limit.resetsAt !== undefined && prev.resetsAt !== undefined && limit.resetsAt !== prev.resetsAt) ||
    currentUsed < prev.lastPercentUsed

  if (windowReset) {
    return {
      lastPercentUsed: currentUsed,
      sessionUsed: Math.round(currentUsed * attributionRatio * 100) / 100,
      resetsAt: limit.resetsAt,
    }
  }

  const delta = Math.max(0, currentUsed - prev.lastPercentUsed)
  const credited = delta * attributionRatio
  const nextSessionUsed = Math.min(currentUsed, Math.round((prev.sessionUsed + credited) * 100) / 100)

  return {
    lastPercentUsed: currentUsed,
    sessionUsed: nextSessionUsed,
    resetsAt: limit.resetsAt ?? prev.resetsAt,
  }
}

/**
 * Advances the session share ledger when a rate-limit reading arrives (`session.start` or `session.measure`).
 * When `isBaseline` is true (`session.start`), initializes window baselines with 0 session usage.
 */
export function applyRateLimits(
  current: SessionShareLedger | null,
  rateLimits: readonly SessionRateLimit[],
  isBaseline = false,
): SessionShareLedger {
  const ledger = current ?? emptyLedger()
  const ratio = isBaseline ? 0 : mainAttributionRatio(ledger)
  const nextWindows: Record<string, WindowLedger> = { ...ledger.windows }

  for (const kind of TRACKED_WINDOWS) {
    const limit = rateLimits.find(l => l.kind === kind)
    if (!limit?.resetsAt) continue
    nextWindows[kind] = updateWindowLedger(isBaseline ? undefined : ledger.windows[kind], limit, ratio)
  }

  return {
    windows: nextWindows,
    mainTokensSinceMeasure: 0,
    subagentTokensSinceMeasure: 0,
    isMainTurnActive: false,
  }
}

export function computeSharePercent(sessionUsed: number, totalUsed: number): number {
  if (totalUsed <= 0 || sessionUsed <= 0) return 0
  const raw = (sessionUsed / totalUsed) * 100
  return Math.max(0, Math.min(100, Math.round(raw)))
}

export function snapshotFromLedger(
  ledger: SessionShareLedger | null,
  rateLimits: readonly SessionRateLimit[],
): SessionShareSnapshot {
  if (!ledger) return {}
  const result: SessionShareSnapshot = {}

  const five = rateLimits.find(l => l.kind === FIVE_HOUR_WINDOW)
  const fiveLedger = ledger.windows[FIVE_HOUR_WINDOW]
  if (five?.resetsAt && fiveLedger) {
    result.fiveHour = {
      kind: FIVE_HOUR_WINDOW,
      sharePercent: computeSharePercent(fiveLedger.sessionUsed, five.percentUsed),
      sessionUsed: fiveLedger.sessionUsed,
      totalUsed: five.percentUsed,
    }
  }

  const seven = rateLimits.find(l => l.kind === SEVEN_DAY_WINDOW)
  const sevenLedger = ledger.windows[SEVEN_DAY_WINDOW]
  if (seven?.resetsAt && sevenLedger) {
    result.sevenDay = {
      kind: SEVEN_DAY_WINDOW,
      sharePercent: computeSharePercent(sevenLedger.sessionUsed, seven.percentUsed),
      sessionUsed: sevenLedger.sessionUsed,
      totalUsed: seven.percentUsed,
    }
  }

  return result
}
