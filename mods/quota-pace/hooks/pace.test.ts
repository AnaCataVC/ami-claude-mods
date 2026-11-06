import { expect, test } from 'claude-code/testing'

import { statusLine } from './messages'
import { computePace, parseWorkdays } from './pace'

const MON_TO_FRI = parseWorkdays('mon,tue,wed,thu,fri')
// Window resets next Monday 00:00 local, so it started this Monday 00:00.
const resetsAt = new Date(2026, 10, 9, 0, 0)

test('Monday through Friday earn 20% each, cumulative', async () => {
  expect(computePace(10, resetsAt, new Date(2026, 10, 2, 9), MON_TO_FRI).targetPercent).toBe(20)
  expect(computePace(10, resetsAt, new Date(2026, 10, 3, 9), MON_TO_FRI).targetPercent).toBe(40)
  expect(computePace(10, resetsAt, new Date(2026, 10, 4, 9), MON_TO_FRI).targetPercent).toBe(60)
  expect(computePace(10, resetsAt, new Date(2026, 10, 6, 23), MON_TO_FRI).targetPercent).toBe(100)
})

test('weekend days add nothing and are not workdays', async () => {
  const saturday = computePace(90, resetsAt, new Date(2026, 10, 7, 12), MON_TO_FRI)
  expect(saturday.targetPercent).toBe(100)
  expect(saturday.isWorkday).toBe(false)
})

test('a window resetting mid-week still splits by workdays', async () => {
  // Resets Thursday 10:00 -> slots start Thu, Fri, Sat, Sun, Mon, Tue, Wed.
  const thursdayReset = new Date(2026, 10, 12, 10, 0)
  expect(computePace(0, thursdayReset, new Date(2026, 10, 5, 11), MON_TO_FRI).targetPercent).toBe(20)
  expect(computePace(0, thursdayReset, new Date(2026, 10, 8, 11), MON_TO_FRI).targetPercent).toBe(40)
  expect(computePace(0, thursdayReset, new Date(2026, 10, 9, 11), MON_TO_FRI).targetPercent).toBe(60)
})

test('a mid-afternoon reset gives Friday morning the full week', async () => {
  // Resets Sunday 15:59: the slot Thursday 15:59 -> Friday 15:59 is Friday's.
  const sundayAfternoon = new Date(2026, 10, 8, 15, 59)
  expect(computePace(84, sundayAfternoon, new Date(2026, 10, 6, 9, 30), MON_TO_FRI).targetPercent).toBe(100)
  expect(computePace(0, sundayAfternoon, new Date(2026, 10, 2, 8), MON_TO_FRI).targetPercent).toBe(20)
})

test('custom workdays and invalid specs', async () => {
  expect(parseWorkdays('Monday, Wednesday').size).toBe(2)
  expect(parseWorkdays('nonsense').size).toBe(5)
  const fourDays = parseWorkdays('mon,tue,wed,thu')
  expect(computePace(0, resetsAt, new Date(2026, 10, 2, 9), fourDays).targetPercent).toBe(25)
})

test('status line shows margin and flags overuse', async () => {
  const pace = computePace(47, resetsAt, new Date(2026, 10, 4, 9), MON_TO_FRI)
  expect(statusLine(pace, 'es')).toBe('✓ 47% de 60% hoy')
  expect(statusLine(computePace(57, resetsAt, new Date(2026, 10, 4, 9), MON_TO_FRI), 'en')).toBe('⚠ 57% of 60% today')
  expect(statusLine(computePace(65, resetsAt, new Date(2026, 10, 4, 9), MON_TO_FRI), 'es')).toBe('✕ 65% de 60% hoy (+5)')
})
