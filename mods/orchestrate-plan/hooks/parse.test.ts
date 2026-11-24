import { expect, test } from 'claude-code/testing'
import {
  cleanTitle,
  dependsOn,
  hasWorkTable,
  idTokens,
  isPlanName,
  labelOf,
  planPathIn,
  isRedundantNote,
  parsePlan,
  parsePrompts,
  prioRank,
  promptFor,
  readStatus,
  statusChanges,
  titleFromHeading,
} from './parse'

const item = (id: string, waitsOn = '') => ({ id, waitsOn, prio: '', note: '', status: 'pendiente' as const, prUrls: [] })

test('ids split into the tokens that name them elsewhere', () => {
  expect(idTokens('PROJ-104 + PROJ-105 (G11)')).toEqual(['PROJ-104', 'PROJ-105', 'G11'])
  expect(idTokens('API-3')).toEqual(['API-3'])
  expect(idTokens('GET /capabilities')).toEqual(['GET /capabilities'])
})

test('Espera a resolves to plan items, by token or bare ticket number, never by prefix', () => {
  const items = [item('PROJ-101'), item('API1'), item('API1-SVC'), item('PROJ-104', '101; plan review')]
  expect(dependsOn(items[3]!, items).map(i => i.id)).toEqual(['PROJ-101'])
  expect(dependsOn(item('X', 'API1-SVC'), items).map(i => i.id)).toEqual(['API1-SVC'])
})

test('a prompt belongs to the item its ### heading names', () => {
  const text = '## Prompts\n### P1-a · API1-SVC select\ncuerpo A1\n### P1-c · API-3 copy\ncuerpo A3\n## Verificación\nno\n'
  const prompts = parsePrompts(text)
  expect(prompts.map(p => p.body)).toEqual(['cuerpo A1', 'cuerpo A3'])
  expect(promptFor(item('API-3'), prompts)?.body).toBe('cuerpo A3')
  expect(promptFor(item('API1'), prompts)).toBe(undefined)
})

test('display helpers', () => {
  expect(isRedundantNote('prompt sin lanzar')).toBe(true)
  expect(isRedundantNote('Tickets creados')).toBe(true)
  expect(isRedundantNote('PRs #12 en revisión')).toBe(false)
  expect([prioRank('P0 (blocks 102)'), prioRank('P1-P2'), prioRank('')]).toEqual([0, 1, 9])
  expect(cleanTitle('Plan: llevar X')).toBe('llevar X')
})

test('a plan is any .md named with "plan" that holds a work table', () => {
  expect(['plan.md', 'PLAN.md', 'plan-rollout.md', 'routing-plan.md'].every(isPlanName)).toBe(true)
  expect(['plan.txt', 'README.md', 'plan.md.bak'].some(isPlanName)).toBe(false)
  expect(hasWorkTable(md)).toBe(true)
  expect(hasWorkTable('# Plan\nsolo prosa\n')).toBe(false)
})

test('finds the plan file a tool call touched', () => {
  const write = (file_path: string) => ({ tool: 'Write', input: { file_path } })
  expect(planPathIn(write('C:\\Users\\dev\\.claude\\plans\\jolly-deer.md'))).toBe('C:/Users/dev/.claude/plans/jolly-deer.md')
  expect(planPathIn(write('/repo/docs/rollout-plan.md'))).toBe('/repo/docs/rollout-plan.md')
  expect(planPathIn(write('/repo/README.md'))).toBeUndefined()
  expect(planPathIn({ tool: 'Bash', input: { command: 'ls' } })).toBeUndefined()
})

const md = `# Plan X
## PRs
| PR | Estado |
|---|---|
| #42 | aprobado |
## Lo que falta
| Prio | Estado | Id | Trabajo | Espera a |
|---|---|---|---|---|
| P1 | en curso — rama creada | G5 | Persistir | #40 |
| P2 | Prompt listo, sin lanzar | A2 | Relanzar | — |
| P1 | hecho | API1 | Elegir | — |
| P0 | bloqueado; espera review | PROJ-103 | Auth | Reviewer |
`

test('finds the table by its Id and Estado header, whatever the section or column order', () => {
  const snap = parsePlan(md)
  expect(snap.title).toBe('Plan X')
  expect(snap.items.map(i => i.id)).toEqual(['G5', 'A2', 'API1', 'PROJ-103'])
  expect(snap.items[0]!).toEqual({ id: 'G5', status: 'en curso', note: 'rama creada', prio: 'P1', waitsOn: '#40', prUrls: [] })
  expect(snap.items[3]!.status).toBe('bloqueado')
  expect(snap.items[3]!.note).toBe('espera review')
})

test('a status outside the vocabulary is a violation, not a guess', () => {
  const snap = parsePlan(md)
  expect(snap.items[1]!.status).toBe(undefined)
  expect(snap.violations.length).toBe(1)
  expect(snap.violations[0]).toContain('A2')
  expect(readStatus('listos para lanzar').status).toBe(undefined)
  expect(readStatus('Listo').status).toBe('listo')
})

test('a plan without an Id/Estado table says so', () => {
  const violations = parsePlan('# P\n| a | b |\n|---|---|\n| 1 | 2 |\n').violations
  expect(violations.length).toBe(1)
  // The column names the user must write stay literal Spanish whatever the display language.
  expect(violations[0]).toContain('Id')
  expect(violations[0]).toContain('Estado')
})

test('the column and status vocabulary is accepted unchanged: Status/Name/Título headers, Bloqueo as dependency column', () => {
  for (const nameHeader of ['Nombre', 'Título', 'Name']) {
    const table = `| Id | ${nameHeader} | Status | Prio | Bloqueo |\n|---|---|---|---|---|\n| X1 | Algo | en curso | P1 | Y2 |`
    expect(parsePlan(table).items[0]).toMatchObject({ id: 'X1', title: 'Algo', status: 'en curso', prio: 'P1', waitsOn: 'Y2' })
  }
  for (const status of ['pendiente', 'listo', 'en curso', 'bloqueado', 'hecho']) {
    expect(parsePlan(`| Id | Estado |\n|---|---|\n| X1 | ${status} |`).items[0]!.status).toBe(status)
  }
})

test('reports status changes between two reads, by id', () => {
  const before = parsePlan(md).items
  const after = parsePlan(md.replace('en curso — rama creada', 'hecho')).items
  expect(statusChanges(before, after).length).toBe(1)
  expect(statusChanges(before, after)[0]).toContain('G5')
  expect(statusChanges(before, before)).toEqual([])
})

test('status-change toasts show the Spanish words as today in es and the display-map words in en', () => {
  const before = parsePlan(md).items
  const toDone = parsePlan(md.replace('en curso — rama creada', 'hecho')).items
  const toBlocked = parsePlan(md.replace('en curso — rama creada', 'bloqueado')).items
  const [es] = statusChanges(before, toDone, 'es')
  expect(es).toContain('G5')
  expect(es).toContain('en curso')
  expect(es).toContain('hecho')
  const [en] = statusChanges(before, toDone, 'en')
  expect(en).toContain('G5')
  expect(en).toContain('in progress')
  expect(en).toContain('done')
  expect(en).not.toContain('en curso')
  expect(en).not.toContain('hecho')
  expect(statusChanges(before, toBlocked, 'en')[0]).toContain('blocked')
  expect(statusChanges(before, toBlocked, 'en')[0]).not.toContain('bloqueado')
  expect(statusChanges(before, toBlocked, 'es')[0]).toContain('bloqueado')
  // Omitting the language is English.
  expect(statusChanges(before, toDone)).toEqual(statusChanges(before, toDone, 'en'))
  expect(statusChanges(before, before, 'en')).toEqual([])
})

test('ids and notes come out as plain text', () => {
  const row = '# P\n| Id | Estado |\n|---|---|\n| G12 / [PROJ-106](https://x/106) | hecho — [#42](https://x/42) en `main`, **ok** |\n'
  const item = parsePlan(row).items[0]!
  expect(item.id).toBe('G12 / PROJ-106')
  expect(item.note).toBe('#42 en main, ok')
})

test('PR URLs come from the raw row, Markdown link targets included, once each', () => {
  const row = '# P\n| Id | Estado |\n|---|---|\n| G1 | en curso — [#9](https://github.com/o/r/pull/9), https://github.com/o/r/pull/9 y https://github.com/o/r/issues/3 |\n'
  expect(parsePlan(row).items[0]!.prUrls).toEqual(['https://github.com/o/r/pull/9'])
})

test('a Nombre column gives the item its title; without one the label is the id', () => {
  const table = `| Id | Nombre | Estado |
|---|---|---|
| P1-a | Retry policy cleanup | listo |
| P1-b |  | listo |`
  const [named, unnamed] = parsePlan(table).items
  expect(named!.title).toBe('Retry policy cleanup')
  expect(labelOf(named!)).toBe('Retry policy cleanup')
  expect(unnamed!.title).toBe(undefined)
  expect(labelOf(unnamed!)).toBe('P1-b')
})

test('a prompt heading lends its words after the id as the title', () => {
  expect(titleFromHeading(item('P1-c'), 'P1-c · Retry policy cleanup')).toBe('Retry policy cleanup')
  expect(titleFromHeading(item('P1-c'), 'P1-c')).toBe(undefined)
  expect(titleFromHeading(item('P1-c'), 'otro encabezado')).toBe(undefined)
})

test('cancelado is a status: the note after the dash is the reason, not a violation', () => {
  const plan = parsePlan('| Id | Estado |\n|---|---|\n| X1 | cancelado — ya no aplica |\n| X2 | cancelado |')
  expect(plan.violations).toEqual([])
  expect(plan.items[0]).toMatchObject({ status: 'cancelado', note: 'ya no aplica' })
  expect(plan.items[1]!.status).toBe('cancelado')
})

test('English status words map to the same canonical PlanStatus values with notes intact', () => {
  const pairs = [
    ['pending — waiting', 'pendiente', 'waiting'],
    ['ready', 'listo', ''],
    ['in progress — #12', 'en curso', '#12'],
    ['blocked — CI', 'bloqueado', 'CI'],
    ['done — merged', 'hecho', 'merged'],
    ['cancelled — dropped', 'cancelado', 'dropped'],
    ['canceled — US spelling', 'cancelado', 'US spelling'],
  ] as const
  for (const [raw, status, note] of pairs) {
    const plan = parsePlan(`| Id | Status |\n|---|---|\n| X1 | ${raw} |`)
    expect(plan.violations).toEqual([])
    expect(plan.items[0]).toMatchObject({ status, note })
  }
})
