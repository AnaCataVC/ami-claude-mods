import { expect, test } from 'claude-code/testing'
import type { SessionRateLimit, TurnUsage } from 'claude-code'

import { langFrom, statusLine } from './messages'
import {
  applyRateLimits,
  computeSharePercent,
  emptyLedger,
  FIVE_HOUR_WINDOW,
  recordTurnComplete,
  recordTurnStart,
  SEVEN_DAY_WINDOW,
  snapshotFromLedger,
} from './share'

const limits = (five: number, seven: number, resetsAt = '2026-11-30T00:00:00Z'): SessionRateLimit[] => [
  { kind: FIVE_HOUR_WINDOW, percentUsed: five, resetsAt },
  { kind: SEVEN_DAY_WINDOW, percentUsed: seven, resetsAt },
]

const makeUsage = (input: number, output: number): TurnUsage => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  model: 'claude-sonnet-4-6',
})

test('tracks percentage of consumed 5h and 7d quota spent in the current main session', async () => {
  // Start session when 5h is at 20% and 7d is at 40%
  let ledger = applyRateLimits(null, limits(20, 40), true)
  let snap = snapshotFromLedger(ledger, limits(20, 40))
  expect(snap.fiveHour?.sharePercent).toBe(0)
  expect(snap.sevenDay?.sharePercent).toBe(0)

  // Main session runs a turn and consumes +10% on 5h (now 30%) and +5% on 7d (now 45%)
  ledger = recordTurnStart(ledger, undefined)
  ledger = recordTurnComplete(ledger, undefined, makeUsage(2000, 1000))
  ledger = applyRateLimits(ledger, limits(30, 45), false)

  snap = snapshotFromLedger(ledger, limits(30, 45))
  // 5h: 10 / 30 = 33%
  expect(snap.fiveHour?.sharePercent).toBe(33)
  // 7d: 5 / 45 = 11%
  expect(snap.sevenDay?.sharePercent).toBe(11)
})

test('ignores quota consumed by nested or parallel sessions while this session is idle', async () => {
  // Session starts at 10% (5h) and 20% (7d)
  let ledger = applyRateLimits(null, limits(10, 20), true)

  // Another nested/parallel session consumes +15% on 5h and +10% on 7d while this session has no active main turn
  ledger = applyRateLimits(ledger, limits(25, 30), false)
  let snap = snapshotFromLedger(ledger, limits(25, 30))
  expect(snap.fiveHour?.sessionUsed).toBe(0)
  expect(snap.fiveHour?.sharePercent).toBe(0)
  expect(snap.sevenDay?.sessionUsed).toBe(0)
  expect(snap.sevenDay?.sharePercent).toBe(0)

  // Now this session runs its own turn and consumes +25% on 5h (total 50%) and +10% on 7d (total 40%)
  ledger = recordTurnStart(ledger, undefined)
  ledger = applyRateLimits(ledger, limits(50, 40), false)
  snap = snapshotFromLedger(ledger, limits(50, 40))
  // 5h: 25 / 50 = 50%
  expect(snap.fiveHour?.sharePercent).toBe(50)
  // 7d: 10 / 40 = 25%
  expect(snap.sevenDay?.sharePercent).toBe(25)
})

test('excludes in-process subagent token weight from the main session share', async () => {
  let ledger = applyRateLimits(null, limits(10, 20), true)

  // Main turn uses 1000 tokens; subagent uses 3000 tokens (main ratio = 25%)
  ledger = recordTurnStart(ledger, undefined)
  ledger = recordTurnComplete(ledger, 'agent-sub-1', makeUsage(2000, 1000))
  ledger = recordTurnComplete(ledger, undefined, makeUsage(500, 500))

  // Total 5h increases by +20 points (from 10% to 30%); main session is credited 25% of 20 = 5 points
  ledger = applyRateLimits(ledger, limits(30, 28), false)
  const snap = snapshotFromLedger(ledger, limits(30, 28))
  expect(snap.fiveHour?.sessionUsed).toBe(5)
  // 5 / 30 = 17%
  expect(snap.fiveHour?.sharePercent).toBe(17)
})

test('resets window baseline when resetsAt rolls over', async () => {
  let ledger = applyRateLimits(null, limits(80, 50, '2026-11-25T10:00:00Z'), true)
  ledger = recordTurnStart(ledger, undefined)
  ledger = applyRateLimits(ledger, limits(90, 55, '2026-11-25T10:00:00Z'), false)

  // Window resets with new timestamp and lower percentUsed during an active turn
  ledger = recordTurnStart(ledger, undefined)
  ledger = applyRateLimits(ledger, limits(6, 6, '2026-11-25T15:00:00Z'), false)
  const snap = snapshotFromLedger(ledger, limits(6, 6, '2026-11-25T15:00:00Z'))
  expect(snap.fiveHour?.sharePercent).toBe(100)
  expect(snap.sevenDay?.sharePercent).toBe(100)
})

test('status line stays under 32 characters and supports English and Spanish', async () => {
  expect(langFrom('es')).toBe('es')
  expect(langFrom('EN')).toBe('en')
  expect(computeSharePercent(0, 0)).toBe(0)

  let ledger = applyRateLimits(emptyLedger(), limits(20, 40), true)
  ledger = recordTurnStart(ledger, undefined)
  ledger = applyRateLimits(ledger, limits(40, 50), false)
  const snap = snapshotFromLedger(ledger, limits(40, 50))

  // 5h: 20/40 = 50%, 7d: 10/50 = 20% -> maxShare = 50 -> warning glyph
  const lineEn = statusLine(snap, 'en')
  const lineEs = statusLine(snap, 'es')
  expect(lineEn).toBe('⚠ 50% 5h·20% 7d')
  expect(lineEs).toBe('⚠ 50% 5h·20% 7d')
  expect((lineEn ?? '').length).toBeLessThanOrEqual(32)

  // Single window formatting
  const onlyFive = statusLine({ fiveHour: snap.fiveHour }, 'es')
  expect(onlyFive).toBe('⚠ 50% 5h')
  expect((onlyFive ?? '').length).toBeLessThanOrEqual(32)

  // High share (>= 80%) uses ✕
  const highLine = statusLine(
    {
      fiveHour: { kind: FIVE_HOUR_WINDOW, sharePercent: 85, sessionUsed: 17, totalUsed: 20 },
      sevenDay: { kind: SEVEN_DAY_WINDOW, sharePercent: 10, sessionUsed: 5, totalUsed: 50 },
    },
    'en',
  )
  expect(highLine).toBe('✕ 85% 5h·10% 7d')
})
