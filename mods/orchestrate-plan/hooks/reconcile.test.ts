import { expect, test } from 'claude-code/testing'

import type { PlanStatus, WorkItem } from '../types'
import {
  IDLE_DRIFT_MS,
  ago,
  detectDrifts,
  driftOf,
  namesItem,
  newlyUnblocked,
  nextItem,
  nextSeen,
  parseRegistryEntry,
  unblocks,
} from './reconcile'

const NOW = 100 * 24 * 3_600_000
const item = (id: string, status: PlanStatus | undefined, extra: Partial<WorkItem> = {}): WorkItem => ({
  id,
  status,
  prio: '',
  waitsOn: '',
  note: '',
  prUrls: [],
  ...extra,
})
const session = (name: string, status: string, idleFor = 0) => ({ name, status, statusUpdatedAt: NOW - idleFor })

test('a session names an item exactly: the id alone or followed by a separator, never a longer id', () => {
  expect(namesItem('P1-b', 'P1-b')).toBe(true)
  expect(namesItem('P1-b · Consolidación', 'P1-b')).toBe(true)
  expect(namesItem('P1-b: algo', 'P1-b')).toBe(true)
  expect(namesItem('P1-b—algo', 'P1-b')).toBe(true)
  expect(namesItem('P1-b1 · otra', 'P1-b')).toBe(false)
  expect(namesItem('P1-b-fix', 'P1-b')).toBe(false)
  expect(namesItem('revisar P1-b', 'P1-b')).toBe(false)
})

test('a registry entry needs a name; statusUpdatedAt falls back to updatedAt', () => {
  expect(parseRegistryEntry('{"name":" P3-c · x ","status":"idle","statusUpdatedAt":5}')).toEqual({ name: 'P3-c · x', status: 'idle', statusUpdatedAt: 5 })
  expect(parseRegistryEntry('{"name":"a","status":"busy","updatedAt":7}')).toEqual({ name: 'a', status: 'busy', statusUpdatedAt: 7 })
  expect(parseRegistryEntry('{"status":"idle"}')).toBe(undefined)
  expect(parseRegistryEntry('not json')).toBe(undefined)
})

test('en curso with its session idle for 20 min or more drifts, with the idle time', () => {
  const p = item('P1-c', 'en curso')
  expect(driftOf(p, [session('P1-c · x', 'idle', IDLE_DRIFT_MS + 5 * 60_000)], {}, NOW)).toContain('25')
  expect(driftOf(p, [session('P1-c · x', 'idle', IDLE_DRIFT_MS - 1)], {}, NOW)).toBe(undefined)
  expect(driftOf(p, [session('P1-c · x', 'idle', IDLE_DRIFT_MS * 2), session('P1-c · y', 'busy')], {}, NOW)).toBe(undefined)
})

test('en curso with no matching live session drifts', () => {
  expect(driftOf(item('P1-c', 'en curso'), [session('P1-c1', 'busy')], {}, NOW)).toBeDefined()
})

test('listo or pendiente with a busy matched session drifts; idle does not', () => {
  expect(driftOf(item('P2', 'listo'), [session('P2 · x', 'busy')], {}, NOW)).toBeDefined()
  expect(driftOf(item('P2', 'pendiente'), [session('P2', 'busy')], {}, NOW)).toBeDefined()
  expect(driftOf(item('P2', 'listo'), [session('P2', 'idle')], {}, NOW)).toBe(undefined)
  expect(driftOf(item('P2', 'bloqueado'), [session('P2', 'busy')], {}, NOW)).toBe(undefined)
})

test('a merged PR drifts any item not yet hecho; other states or hecho do not', () => {
  const url = 'https://github.com/o/r/pull/1'
  expect(driftOf(item('X', 'bloqueado', { prUrls: [url] }), [], { [url]: 'MERGED' }, NOW)).toBeDefined()
  expect(driftOf(item('X', 'hecho', { prUrls: [url] }), [], { [url]: 'MERGED' }, NOW)).toBe(undefined)
  expect(driftOf(item('X', 'listo', { prUrls: [url] }), [], { [url]: 'OPEN' }, NOW)).toBe(undefined)
  expect(driftOf(item('X', 'listo', { prUrls: [url] }), [], {}, NOW)).toBe(undefined)
})

test('drifts come out in table order, one per drifting item', () => {
  const items = [item('A', 'en curso'), item('B', 'hecho'), item('C', 'listo')]
  expect(detectDrifts(items, [session('C', 'busy')], {}, NOW)).toMatchObject([{ id: 'A' }, { id: 'C' }])
})

const graph = () => [
  item('P1-d', 'en curso'),
  item('P1-e', 'hecho'),
  item('P3-b1', 'pendiente', { waitsOn: 'P1-d' }),
  item('P3-c', 'bloqueado', { waitsOn: 'P1-d, P1-e' }),
  item('P3-d', 'pendiente', { waitsOn: 'P1-d, P3-c' }),
]

test('closing an item unblocks the open items whose other dependencies are all hecho', () => {
  const items = graph()
  expect(unblocks(items[0]!, items).map(i => i.id)).toEqual(['P3-b1', 'P3-c'])
  expect(unblocks(items[3]!, items).map(i => i.id)).toEqual([])
  expect(unblocks(items[1]!, items)).toEqual([])
})

test('an item turning hecho reports which items are left with every dependency done', () => {
  const before = graph()
  const after = before.map(i => (i.id === 'P1-d' ? { ...i, status: 'hecho' as const } : i))
  expect(newlyUnblocked(before, after)).toHaveLength(1)
  const [line] = newlyUnblocked(before, after)
  for (const id of ['P1-d', 'P3-b1', 'P3-c']) expect(line).toContain(id)
  expect(newlyUnblocked(before, before)).toEqual([])
})

test('next is the best-prio listo, else the best-prio pendiente with every dependency hecho', () => {
  expect(nextItem([item('A', 'listo', { prio: 'P2' }), item('B', 'listo', { prio: 'P0' }), item('C', 'pendiente', { prio: 'P0' })])?.id).toBe('B')
  const items = [
    item('D', 'hecho'),
    item('E', 'en curso'),
    item('F', 'pendiente', { prio: 'P0', waitsOn: 'E' }),
    item('G', 'pendiente', { prio: 'P2', waitsOn: 'D' }),
    item('H', 'pendiente', { prio: 'P1' }),
  ]
  expect(nextItem(items)?.id).toBe('H')
  expect(nextItem([item('E', 'en curso')])).toBe(undefined)
})

test('ages read in min, h or d and carry the amount', () => {
  expect(ago(NOW - 30_000, NOW)).toBeDefined()
  expect(ago(NOW - 59 * 60_000, NOW)).toContain('59')
  expect(ago(NOW - 5 * 3_600_000, NOW)).toContain('5')
  expect(ago(NOW - 3 * 24 * 3_600_000 - 1, NOW)).toContain('3')
})

test('the first time an id was seen in its status survives until the status changes; gone ids drop', () => {
  const seen = { A: { status: 'bloqueado', since: 1 }, B: { status: 'listo', since: 2 }, Gone: { status: 'hecho', since: 3 } }
  expect(nextSeen(seen, [item('A', 'bloqueado'), item('B', 'en curso'), item('C', undefined)], 50)).toEqual({
    A: { status: 'bloqueado', since: 1 },
    B: { status: 'en curso', since: 50 },
    C: { status: '?', since: 50 },
  })
})
