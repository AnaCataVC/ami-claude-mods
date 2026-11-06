import type { PlanStatus, WorkItem } from '../types'
import { t } from './messages'
import type { Lang } from './messages'

export const STATUSES: readonly PlanStatus[] = ['bloqueado', 'en curso', 'listo', 'pendiente', 'hecho']

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
const isSeparator = (row: string[]) => row.every(c => /^:?-+:?$/.test(c))
const columnOf = (header: string[], names: string[]) =>
  header.findIndex(h => names.includes(h.toLowerCase()))

// Estado cells follow the contract "<status word> — <free note>"; anything else is a violation.
export const readStatus = (cell: string): { status?: PlanStatus; note: string } => {
  const lower = cell.toLowerCase()
  const status = STATUSES.find(s => lower === s || new RegExp(`^${s}(\\s*[—;:,-]|$)`).test(lower))
  if (!status) return { note: cell }
  return { status, note: cell.slice(status.length).replace(/^\s*[—;:,-]\s*/, '') }
}

// The work table is the first table whose header names an Id and an Estado/Status column,
// wherever it sits in the document.
export const parsePlan = (text: string, lang: Lang = 'en') => {
  const lines = text.split(/\r?\n/)
  const title = (lines.find(l => l.startsWith('# ')) ?? '# plan.md').slice(2).trim()
  const items: WorkItem[] = []
  const violations: string[] = []

  const headerAt = lines.findIndex(l => {
    if (!l.trim().startsWith('|')) return false
    const header = cells(l)
    return columnOf(header, ['id']) >= 0 && columnOf(header, ['estado', 'status']) >= 0
  })
  if (headerAt < 0) return { title, items, violations: [t(lang).noTable] }

  const header = cells(lines[headerAt] ?? '')
  const col = {
    id: columnOf(header, ['id']),
    title: columnOf(header, ['nombre', 'título', 'titulo', 'name', 'title']),
    status: columnOf(header, ['estado', 'status']),
    prio: columnOf(header, ['prio', 'prioridad', 'priority']),
    waitsOn: columnOf(header, ['espera a', 'bloqueo', 'waits on', 'blocked by']),
  }
  for (const line of lines.slice(headerAt + 1)) {
    if (!line.trim().startsWith('|')) break
    const row = cells(line)
    if (isSeparator(row) || !row[col.id]) continue
    const { status, note } = readStatus(row[col.status] ?? '')
    const id = plainText(row[col.id] ?? '')
    if (!status) violations.push(t(lang).outsideVocabulary(id))
    items.push({
      id,
      title: col.title >= 0 ? plainText(row[col.title] ?? '') || undefined : undefined,
      status,
      note: plainText(note),
      prio: col.prio >= 0 ? row[col.prio] ?? '' : '',
      waitsOn: col.waitsOn >= 0 ? row[col.waitsOn] ?? '' : '',
      // From the raw row: plainText drops a Markdown link's URL.
      prUrls: prUrlsIn(line),
    })
  }
  return { title, items, violations }
}

const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g

export const prUrlsIn = (text: string) => [...new Set(text.match(PR_URL) ?? [])]

// Any Markdown file with "plan" in its name is a candidate; the work table decides.
export const isPlanName = (name: string) => /plan/i.test(name) && /\.md$/i.test(name)

// The plan file a tool call touched, if any: a plan-named .md anywhere, or any .md under a `plans` folder
// (plan mode names its files after a slug). Lets a session keep tracking the plan it already worked on.
export const planPathIn = (toolCall: unknown): string | undefined => {
  const text = JSON.stringify(toolCall).replace(/\\\\/g, '/')
  const paths = text.match(/(?:[A-Za-z]:)?[^"\s:*?<>|]*\.md/gi) ?? []
  return paths.find(p => /^([A-Za-z]:)?\//.test(p) && (isPlanName(p.split('/').pop() ?? '') || /\/plans\/[^/]+\.md$/i.test(p)))
}

export const hasWorkTable =(text: string) => parsePlan(text).items.length > 0

const statusWord = (status: PlanStatus | undefined, lang: Lang) => (status ? t(lang).status[status] : '?')

export const statusChanges = (before: readonly WorkItem[], after: readonly WorkItem[], lang: Lang = 'en') => {
  const previous = new Map(before.map(i => [i.id, i.status]))
  return after
    .filter(i => previous.has(i.id) && previous.get(i.id) !== i.status)
    .map(i => `${labelOf(i)}: ${statusWord(previous.get(i.id), lang)} → ${statusWord(i.status, lang)}`)
}

// The pane draws plain text: Markdown links keep their label, code spans lose their backticks.
export const plainText = (cell: string) =>
  cell.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]*)\*\*/g, '$1')

// An id's own tokens, the ones that name it elsewhere: "ADA-864 + ADA-865 (G11)" → ADA-864, ADA-865, G11.
export const idTokens = (id: string) => {
  const tokens = id.split(/[\s+/(),:]+/).filter(t => /\d/.test(t) || /^[A-Z][\w-]*-[A-Z]+$/.test(t))
  return tokens.length ? tokens : [id]
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// A dash is part of a token, so H1 does not match inside H1-HUB.
const mentions = (text: string, token: string) => new RegExp(`(?<![\\w-])${escape(token)}(?![\\w-])`).test(text)

// The plan's items a "Espera a" cell names, by full token or by a ticket's bare number ("814" for ADA-814).
export const dependsOn = (item: WorkItem, items: readonly WorkItem[]) =>
  items.filter(other => {
    if (other.id === item.id || !item.waitsOn) return false
    return idTokens(other.id).some(t => {
      const number = /^[A-Z]+-(\d+)$/.exec(t)?.[1]
      return mentions(item.waitsOn, t) || (number !== undefined && mentions(item.waitsOn, number))
    })
  })

export type Prompt = { heading: string; body: string }

// Launch prompts are the ### blocks under a ## section whose title mentions "prompt".
export const parsePrompts = (text: string): Prompt[] => {
  const prompts: Prompt[] = []
  let inSection = false
  let current: Prompt | undefined
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      inSection = /prompt/i.test(line)
      current = undefined
    } else if (inSection && line.startsWith('### ')) {
      current = { heading: line.slice(4).trim(), body: '' }
      prompts.push(current)
    } else if (current) current.body += `${line}\n`
  }
  return prompts.map(p => ({ ...p, body: p.body.trim() }))
}

// An item's prompt is the first one whose heading names one of its tokens.
export const promptFor = (item: WorkItem, prompts: readonly Prompt[]) =>
  prompts.find(p => idTokens(item.id).some(t => mentions(p.heading, t)))

// A note that only restates its status ("prompt sin lanzar" under listo) adds nothing.
export const isRedundantNote = (note: string) =>
  /^((prompts?|tickets?|listos?|sin|lanzar|creados?|pendientes?|y)[\s,.;]*)+$/i.test(note.trim())

// "P0 (bloquea 860)" ranks 0; no P-number ranks last.
export const prioRank = (prio: string) => Number(/P(\d)/i.exec(prio)?.[1] ?? 9)

// "P1-c · Rechazo no reintentable" -> the words after the id; undefined when the heading is only the id.
export const titleFromHeading = (item: WorkItem, heading: string) => {
  const token = idTokens(item.id).find(t => heading.includes(t))
  if (!token) return undefined
  const rest = heading.slice(heading.indexOf(token) + token.length).replace(/^[\s·:—–-]+/, '').trim()
  return rest || undefined
}

// What the pane calls an item: its name when it has one, else the bare id.
export const labelOf = (item: Pick<WorkItem, 'id' | 'title'>) => item.title ?? item.id

export const cleanTitle = (title: string) => title.replace(/^plan\s*:\s*/i, '')
