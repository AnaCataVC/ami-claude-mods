const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_DAYS = 7
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type Pace = {
  usedPercent: number
  targetPercent: number
  /** Identifies the current day slot inside the current window, for once-per-day alerts. */
  slotKey: string
  isWorkday: boolean
}

/** Parses "mon,tue,..." into weekday indexes (0 = Sunday); falls back to Mon–Fri when nothing valid is given. */
export function parseWorkdays(spec: string): Set<number> {
  const days = new Set<number>()
  for (const token of spec.toLowerCase().split(/[\s,]+/)) {
    const index = DAY_NAMES.indexOf(token.slice(0, 3) as (typeof DAY_NAMES)[number])
    if (index >= 0) days.add(index)
  }
  return days.size > 0 ? days : new Set([1, 2, 3, 4, 5])
}

/**
 * Splits the 7-day window ending at `resetsAt` into seven 24h slots, each named by
 * the local weekday at its midpoint. Every workday slot earns an equal share of 100%;
 * the target is the share of every workday slot started so far, so the budget for
 * a day is available from that day's start.
 */
export function computePace(usedPercent: number, resetsAt: Date, now: Date, workdays: Set<number>): Pace {
  const windowStart = resetsAt.getTime() - WINDOW_DAYS * DAY_MS
  const currentSlot = Math.min(WINDOW_DAYS - 1, Math.max(0, Math.floor((now.getTime() - windowStart) / DAY_MS)))
  // A slot counts as the weekday at its midpoint, the day it mostly covers: labelling by its start
  // would push the budget of a window resetting mid-afternoon to the following afternoon.
  const isWorkdaySlot = (slot: number) => workdays.has(new Date(windowStart + slot * DAY_MS + DAY_MS / 2).getDay())

  let workdaySlots = 0
  let startedWorkdaySlots = 0
  for (let slot = 0; slot < WINDOW_DAYS; slot++) {
    if (!isWorkdaySlot(slot)) continue
    workdaySlots++
    if (slot <= currentSlot) startedWorkdaySlots++
  }

  const targetPercent = workdaySlots === 0 ? 100 : Math.round((startedWorkdaySlots / workdaySlots) * 1000) / 10
  return {
    usedPercent,
    targetPercent,
    slotKey: `${resetsAt.toISOString()}#${currentSlot}`,
    isWorkday: isWorkdaySlot(currentSlot),
  }
}
