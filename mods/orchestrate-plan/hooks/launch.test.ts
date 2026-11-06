import { expect, test } from 'claude-code/testing'
import { LAUNCH_COOLDOWN_MS, canLaunch, launchBatchInstruction, launchInstruction, launchable, sessionTitle, syncInstruction } from './launch'

test('the instruction names the id, the plan file, the heading, the title prefix and the en curso update', () => {
  const text = launchInstruction({ id: 'P1-c', title: 'Rechazo no reintentable' }, 'C:/x/plan.md', 'P1-c · H3-HUB')
  expect(text).toContain('para P1-c ')
  expect(text).toContain('en C:/x/plan.md ')
  expect(text).toContain('(encabezado: P1-c · H3-HUB)')
  expect(text).toContain('start_session')
  expect(text).toContain('el título "P1-c · Rechazo no reintentable"')
  expect(text).toContain('`en curso — sesión <título> (<id de sesión local_…>)`')
})

test('the batch instruction lists every id and heading in one turn, with the same rules', () => {
  const text = launchBatchInstruction(
    [
      { item: { id: 'P1-a', title: 'Uno' }, heading: 'P1-a · uno' },
      { item: { id: 'P1-b' }, heading: 'P1-b · dos' },
    ],
    'C:/x/plan.md',
  )
  expect(text).toContain('para cada uno de P1-a, P1-b ')
  expect(text).toContain('(encabezados: P1-a · uno | P1-b · dos)')
  expect(text).toContain('start_session')
  expect(text).toContain('"P1-a · Uno", "P1-b"')
  expect(text).toContain('`en curso — sesión <título> (<id de sesión local_…>)`')
})

test('a session title is the id, then the name when the item has one', () => {
  expect(sessionTitle({ id: 'P3-HUB3', title: 'Regla de rechazo' })).toBe('P3-HUB3 · Regla de rechazo')
  expect(sessionTitle({ id: 'P3-HUB3' })).toBe('P3-HUB3')
})

test('the sync instruction names the row, the plan and the reason', () => {
  expect(syncInstruction('P1-d', 'C:/x/plan.md', 'PR mergeado')).toBe(
    'Sincroniza la fila P1-d de C:/x/plan.md: PR mergeado. Verifica contra la fuente y actualiza su Estado.',
  )
})

test('a launch locks the item until the cooldown passes', () => {
  expect(canLaunch(undefined, 1000)).toBe(true)
  expect(canLaunch(1000, 1000 + LAUNCH_COOLDOWN_MS - 1)).toBe(false)
  expect(canLaunch(1000, 1000 + LAUNCH_COOLDOWN_MS)).toBe(true)
})

test('launchable means listo, with a prompt, and out of cooldown', () => {
  const item = (id: string, status: 'listo' | 'pendiente') => ({ id, status, prio: '', waitsOn: '', note: '', prUrls: [] })
  const items = [item('A', 'listo'), item('B', 'listo'), item('C', 'listo'), item('D', 'pendiente')]
  const prompts = { A: 'a', B: 'b', D: 'd' }
  expect(launchable(items, prompts, {}, 10_000).map(i => i.id)).toEqual(['A', 'B'])
  expect(launchable(items, prompts, { A: 9_000 }, 10_000).map(i => i.id)).toEqual(['B'])
})
