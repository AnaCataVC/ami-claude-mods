import type { Drift, WorkItem } from '../types'
import { t } from './messages'
import type { Lang } from './messages'
import { dependsOn, labelOf, prioRank } from './parse'

export const IDLE_DRIFT_MS = 20 * 60_000

export type LiveSession = { name: string; status: string; statusUpdatedAt: number }

// One file of the session registry; a session without a name can never match an item.
export const parseRegistryEntry = (text: string): LiveSession | undefined => {
  try {
    const entry = JSON.parse(text) as Record<string, unknown>
    if (typeof entry.name !== 'string' || !entry.name.trim()) return undefined
    const at = typeof entry.statusUpdatedAt === 'number' ? entry.statusUpdatedAt : entry.updatedAt
    return {
      name: entry.name.trim(),
      status: typeof entry.status === 'string' ? entry.status : '',
      statusUpdatedAt: typeof at === 'number' ? at : 0,
    }
  } catch {
    return undefined
  }
}

// Exact: the name is the id, or starts with it followed by a separator, so P1-b never claims P1-b1.
export const namesItem = (sessionName: string, id: string) =>
  sessionName === id || (sessionName.startsWith(id) && /^[\s·:—]/.test(sessionName.slice(id.length)))

export const ago = (since: number, now: number, lang: Lang = 'en') => {
  const text = t(lang)
  const minutes = Math.floor((now - since) / 60_000)
  if (minutes < 1) return text.justNow
  if (minutes < 60) return text.minutesAgo(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return text.hoursAgo(hours)
  return text.daysAgo(Math.floor(hours / 24))
}

// Where the plan disagrees with the live sessions or with GitHub; undefined when it agrees.
export const driftOf = (
  item: WorkItem,
  sessions: readonly LiveSession[],
  prStates: Readonly<Record<string, string | undefined>>,
  now: number,
  lang: Lang = 'en',
) => {
  const text = t(lang)
  if (item.status !== 'hecho' && item.prUrls.some(url => prStates[url] === 'MERGED')) return text.driftMerged
  const own = sessions.filter(s => namesItem(s.name, item.id))
  if (item.status === 'en curso') {
    if (!own.length) return text.driftNoSession
    if (!own.every(s => s.status === 'idle')) return undefined
    const idleSince = Math.max(...own.map(s => s.statusUpdatedAt))
    return now - idleSince >= IDLE_DRIFT_MS ? text.driftIdle(ago(idleSince, now, lang)) : undefined
  }
  if ((item.status === 'listo' || item.status === 'pendiente') && own.some(s => s.status === 'busy')) {
    return text.driftWorking
  }
  return undefined
}

export const detectDrifts = (
  items: readonly WorkItem[],
  sessions: readonly LiveSession[],
  prStates: Readonly<Record<string, string | undefined>>,
  now: number,
  lang: Lang = 'en',
): Drift[] =>
  items.flatMap(item => {
    const reason = driftOf(item, sessions, prStates, now, lang)
    return reason ? [{ id: item.id, reason }] : []
  })

// The open items whose every dependency would be hecho once `item` is.
export const unblocks = (item: WorkItem, items: readonly WorkItem[]) =>
  item.status === 'hecho'
    ? []
    : items.filter(other => {
        if (other.status === 'hecho' || other.id === item.id) return false
        const deps = dependsOn(other, items)
        return deps.some(d => d.id === item.id) && deps.every(d => d.id === item.id || d.status === 'hecho')
      })

// One line per item that turned hecho between two reads and left others with every dependency done.
export const newlyUnblocked = (before: readonly WorkItem[], after: readonly WorkItem[], lang: Lang = 'en') => {
  const previous = new Map(before.map(i => [i.id, i.status]))
  return after
    .filter(i => i.status === 'hecho' && previous.has(i.id) && previous.get(i.id) !== 'hecho')
    .flatMap(done => {
      const freed = after.filter(other => {
        if (other.status === 'hecho') return false
        const deps = dependsOn(other, after)
        return deps.some(d => d.id === done.id) && deps.every(d => d.status === 'hecho')
      })
      return freed.length ? [t(lang).unblocked(labelOf(done), freed.map(labelOf).join(', '))] : []
    })
}

const bestPrio = (items: readonly WorkItem[]) => [...items].sort((a, b) => prioRank(a.prio) - prioRank(b.prio))[0]

// The best-prio listo item; with none, the best-prio pendiente whose dependencies are all hecho.
export const nextItem = (items: readonly WorkItem[]) =>
  bestPrio(items.filter(i => i.status === 'listo')) ??
  bestPrio(items.filter(i => i.status === 'pendiente' && dependsOn(i, items).every(d => d.status === 'hecho')))

export type SeenStatus = { status: string; since: number }

// Keeps the first time each id was seen in its current status; ids gone from the plan drop out.
export const nextSeen = (
  seen: Readonly<Record<string, SeenStatus>>,
  items: readonly WorkItem[],
  now: number,
): Record<string, SeenStatus> =>
  Object.fromEntries(
    items.map(item => {
      const status = item.status ?? '?'
      const previous = seen[item.id]
      return [item.id, previous?.status === status ? previous : { status, since: now }]
    }),
  )
