const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type Pace = {
  usedPercent: number
  targetPercent: number
  /** Identifies the current local day, for once-per-day alerts. */
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
 * The target follows the calendar week (Monday first), independent of when the usage window
 * resets: every workday earns an equal share of 100%, and today's target is the cumulative
 * share of the workdays from Monday up to and including today. Non-workdays add nothing.
 */
export function computePace(usedPercent: number, now: Date, workdays: Set<number>): Pace {
  const todayIndex = (now.getDay() + 6) % 7
  let workdayCount = 0
  let startedWorkdays = 0
  for (let index = 0; index < 7; index++) {
    if (!workdays.has((index + 1) % 7)) continue
    workdayCount++
    if (index <= todayIndex) startedWorkdays++
  }

  const targetPercent = workdayCount === 0 ? 100 : Math.round((startedWorkdays / workdayCount) * 1000) / 10
  return {
    usedPercent,
    targetPercent,
    slotKey: `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`,
    isWorkday: workdays.has(now.getDay()),
  }
}
