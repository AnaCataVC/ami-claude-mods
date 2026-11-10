import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { messages } from './messages'

const PR = 'https://github.com/o/r/pull/7'
const PLAN = `# Plan X
| Id | Estado | Prio | Espera a |
|---|---|---|---|
| P1-d | en curso — [#7](${PR}) | P1 | — |
| P2 | listo | P2 | — |
| P3 | pendiente | P2 | P1-d |
`
const REGISTRY = JSON.stringify({ name: 'P2 · otra cosa', status: 'busy', statusUpdatedAt: 1 })

// Stands in for the engine beneath the mod: cwd listing, the plan, the session registry, gh and the UI.
function fakeEngine(on: On, lang?: string | 'reject', env: Record<string, string> = {}) {
  if (lang === 'reject') {
    on('env.get', async (_$, e) => {
      if ((e as unknown as { name: string }).name === 'CLAUDE_MODS_LANG') throw new Error('env unavailable')
      return { value: undefined } as never
    })
  } else {
    mock.env(on, lang === undefined ? env : { ...env, CLAUDE_MODS_LANG: lang })
  }
  const listed: string[] = []
  const statuses: Array<string | undefined> = []
  const commands: Array<{ name: string; description?: string; argumentHint?: string }> = []
  const processes: string[] = []
  const state = new Map<string, unknown>()
  let version = 0
  on('state.get', async (_$, e) => ({ value: { value: state.get(e.key), version } }) as never)
  on('state.set', async (_$, e) => {
    state.set(e.key, (e as unknown as { value: unknown }).value)
    version += 1
    return { value: { isSet: true, version } } as never
  })
  mock.store(on)
  const clock = mock.clock(on, { now: 0 })
  on('command.register', async (_$, e) => {
    commands.push(e as unknown as { name: string; description?: string; argumentHint?: string })
    return { value: { isRegistered: true } } as never
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('fs.list', async (_$, e) => {
    listed.push(e.path ?? '')
    return {
      value: e.path?.includes('sessions')
        ? [{ name: '1.json', kind: 'file', size: 1, mtimeMs: 1, isLink: false }]
        : [{ name: 'plan.md', kind: 'file', size: 1, mtimeMs: 1, isLink: false }],
    } as never
  })
  on('fs.read', async (_$, e) => ({ value: e.path.endsWith('1.json') ? REGISTRY : PLAN }) as never)
  on('fs.stat', async () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('ui.status', async (_$, e) => {
    statuses.push((e as unknown as { text?: string }).text)
    return { value: undefined } as never
  })
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('process.run', async (_$, e) => {
    processes.push(e.argv.join(' '))
    const merged = e.argv[0] === 'gh' && e.argv.includes(PR)
    return { value: { exitCode: merged ? 0 : 1, stdout: merged ? 'MERGED\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  return { processes, clock, state, statuses, commands, listed }
}

async function runStart($: Parameters<Parameters<typeof test>[1]>[0], on: On, lang?: string) {
  const engine = fakeEngine(on, lang)
  await $.session.start({ source: 'startup', cwd: 'C:/proj' } as never)
  await engine.clock.settle()
  return engine
}

test('es: a merged PR in an open row and a busy session on a listo row become drift rows; gh runs once per URL', async ($, on) => {
  const engine = await runStart($, on, 'es')
  expect(engine.state.get('drifts')).toEqual([
    { id: 'P1-d', reason: 'PR mergeado' },
    { id: 'P2', reason: 'tiene una sesión trabajando' },
  ])
  await engine.clock.advance(15_000)
  expect(engine.processes).toEqual([`gh pr view ${PR} --json state -q .state`])
})

test('en: the same plan yields the same drift rows (parsing is language independent) with non-Spanish reasons', async ($, on) => {
  const engine = await runStart($, on)
  const drifts = engine.state.get('drifts') as Array<{ id: string; reason: string }>
  expect(drifts.map(d => d.id)).toEqual(['P1-d', 'P2'])
  expect(drifts[0]!.reason).not.toBe('PR mergeado')
  expect(drifts[1]!.reason).not.toBe('tiene una sesión trabajando')
})

test('a value other than es (es-CL) behaves as English', async ($, on) => {
  const engine = await runStart($, on, 'es-CL')
  const drifts = engine.state.get('drifts') as Array<{ id: string; reason: string }>
  expect(drifts[0]!.reason).not.toBe('PR mergeado')
})

test('a rejecting env.get leaves the mod working in English', async ($, on) => {
  const engine = fakeEngine(on, 'reject')
  await $.session.start({ source: 'startup', cwd: 'C:/proj' } as never)
  await engine.clock.settle()
  const drifts = engine.state.get('drifts') as Array<{ id: string; reason: string }>
  expect(drifts.map(d => d.id)).toEqual(['P1-d', 'P2'])
})

// The engine reports Windows paths with backslashes.
const posix = (paths: readonly string[]) => paths.map(p => p.split('\\').join('/'))

// Mods load from any folder, so the registry must come from the config dir, never from the mod's own location.
test('the session registry is read from the user config dir, not relative to the mod', async ($, on) => {
  const engine = fakeEngine(on, undefined, { USERPROFILE: 'test-home', HOME: 'test-home' })
  await $.session.start({ source: 'startup', cwd: 'C:/proj' } as never)
  await engine.clock.settle()
  expect(posix(engine.listed).some(p => p.endsWith('test-home/.claude/sessions'))).toBe(true)
})

test('CLAUDE_CONFIG_DIR wins over the home directory for the session registry', async ($, on) => {
  const engine = fakeEngine(on, undefined, {
    USERPROFILE: 'test-home',
    HOME: 'test-home',
    CLAUDE_CONFIG_DIR: 'test-cfg',
  })
  await $.session.start({ source: 'startup', cwd: 'C:/proj' } as never)
  await engine.clock.settle()
  expect(posix(engine.listed).some(p => p.endsWith('test-cfg/sessions'))).toBe(true)
  expect(posix(engine.listed).some(p => p.endsWith('test-home/.claude/sessions'))).toBe(false)
})

const PANE = { surface: 'terminal', component: 'Pane', requestId: 'orchestrate-plan', props: {} } as never

async function paneText($: Parameters<Parameters<typeof test>[1]>[0], on: On, lang?: string) {
  const engine = await runStart($, on, lang)
  return { engine, text: JSON.stringify(await $.ui.render(PANE)) }
}

const SPANISH_STATUSES = ['pendiente', 'listo', 'en curso', 'bloqueado', 'hecho']
// The fixture plan holds one pendiente, one listo and one en curso row; empty statuses are not listed.
const PRESENT_SPANISH = ['pendiente', 'listo', 'en curso']
const PRESENT_ENGLISH = ['pending', 'ready', 'in progress']

test('es: the pane legend and group headers show the Spanish status words', async ($, on) => {
  const text = (await paneText($, on, 'es')).text.toLowerCase()
  for (const word of PRESENT_SPANISH) expect(text).toContain(word)
})

test('en: the pane legend and group headers show the display-map status words, not the Spanish ones', async ($, on) => {
  const text = (await paneText($, on)).text.toLowerCase()
  for (const word of PRESENT_ENGLISH) expect(text).toContain(word)
  for (const word of SPANISH_STATUSES) expect(text).not.toContain(word)
})

test('en: the status line counts use the display-map words, not the Spanish ones', async ($, on) => {
  const { engine } = await paneText($, on)
  const line = engine.statuses.filter(Boolean).join(' | ')
  expect(line.length).toBeGreaterThan(0)
  for (const word of SPANISH_STATUSES) expect(line).not.toContain(word)
})

// Description and hint of every registered command follow the language.
const table = (lang: 'en' | 'es') => Object.values(messages[lang]) as unknown[]

async function registeredCommands($: Parameters<Parameters<typeof test>[1]>[0], on: On, lang?: string) {
  const engine = await runStart($, on, lang)
  expect(engine.commands.length).toBeGreaterThan(0)
  return engine.commands
}

for (const [lang, other] of [['es', 'en'], ['en', 'es']] as const) {
  test(`${lang}: every registered command has the ${lang} description and hint`, async ($, on) => {
    for (const command of await registeredCommands($, on, lang === 'es' ? 'es' : undefined)) {
      expect(table(lang)).toContain(command.description)
      expect(table(other)).not.toContain(command.description)
      if (command.argumentHint !== undefined) expect(table(other)).not.toContain(command.argumentHint)
    }
  })
}
