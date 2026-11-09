import { expect, test } from 'claude-code/testing'

import { statusLine } from './messages'
import { computePace, parseWorkdays } from './pace'

const MON_TO_FRI = parseWorkdays('mon,tue,wed,thu,fri')
const at = (day: number, hour = 9) => new Date(2026, 10, day, hour)

test('Monday through Friday earn 20% each, cumulative', async () => {
  expect(computePace(10, at(2), MON_TO_FRI).targetPercent).toBe(20)
  expect(computePace(10, at(3), MON_TO_FRI).targetPercent).toBe(40)
  expect(computePace(10, at(4), MON_TO_FRI).targetPercent).toBe(60)
  expect(computePace(10, at(5), MON_TO_FRI).targetPercent).toBe(80)
  expect(computePace(10, at(6, 23), MON_TO_FRI).targetPercent).toBe(100)
})

test('weekend days add nothing and are not workdays', async () => {
  const saturday = computePace(90, at(7, 12), MON_TO_FRI)
  expect(saturday.targetPercent).toBe(100)
  expect(saturday.isWorkday).toBe(false)
  expect(computePace(90, at(8), MON_TO_FRI).targetPercent).toBe(100)
})

test('custom workdays and invalid specs', async () => {
  expect(parseWorkdays('Monday, Wednesday').size).toBe(2)
  expect(parseWorkdays('nonsense').size).toBe(5)
  const fourDays = parseWorkdays('mon,tue,wed,thu')
  expect(computePace(0, at(2), fourDays).targetPercent).toBe(25)
})

test('status line shows margin and flags overuse', async () => {
  const pace = computePace(47, at(4), MON_TO_FRI)
  expect(statusLine(pace, 'es')).toBe('✓ 47% de 60% hoy')
  expect(statusLine(computePace(57, at(4), MON_TO_FRI), 'en')).toBe('⚠ 57% of 60% today')
  expect(statusLine(computePace(65, at(4), MON_TO_FRI), 'es')).toBe('✕ 65% de 60% hoy (+5)')
})
