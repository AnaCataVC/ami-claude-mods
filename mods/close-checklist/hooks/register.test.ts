import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { messages } from './messages'

import type { Tracked } from '../types'

const CWD = 'C:\\proj'

function fakeEngine(on: On, processAnswer: (argv: readonly string[]) => { exitCode: number; stdout: string }, lang?: string | 'reject', isStateMocked = true) {
  if (lang === 'reject') {
    on('env.get', async (_$, e) => {
      if ((e as unknown as { name: string }).name === 'CLAUDE_MODS_LANG') throw new Error('env unavailable')
      return { value: undefined } as never
    })
  } else {
    mock.env(on, lang === undefined ? {} : { CLAUDE_MODS_LANG: lang })
  }
  const registered: string[] = []
  const commands: CommandEvent[] = []
  const store = new Map<string, unknown>()
  const toasts: string[] = []
  const processes: string[] = []
  let version = 0
  let toolAnswer: Record<string, unknown> = { result: 'ok' }
  // The engine's own state redraws mounted panes on a write; the Map stand-in cannot.
  if (isStateMocked) {
    on('state.get', async (_$, e) => ({ value: { value: store.get(e.key), version } }) as never)
    on('state.set', async (_$, e) => {
      store.set(e.key, (e as unknown as { value: unknown }).value)
      version += 1
      return { value: { isSet: true, version } } as never
    })
  }
  on('session.cwd', async () => ({ value: CWD }) as never)
  on('session.id', async () => ({ value: 'sid' }) as never)
  on('fs.exists', async () => ({ value: false }) as never)
  on('command.register', async (_$, e) => {
    registered.push((e as unknown as { name: string }).name)
    commands.push(e as unknown as CommandEvent)
    return { value: { isRegistered: true } } as never
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('session.end', async () => ({ sessionId: 'sid' }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', async (_$, e) => {
    toasts.push((e as unknown as { text: string }).text)
    return { value: {} } as never
  })
  on('process.run', async (_$, e) => {
    processes.push(e.argv.join(' '))
    return { value: { ...processAnswer(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  on('tool.call', async () => toolAnswer as never)
  return {
    registered,
    commands,
    toasts,
    processes,
    tracked: () => store.get('tracked') as Tracked | undefined,
    answerToolWith: (answer: Record<string, unknown>) => {
      toolAnswer = answer
    },
  }
}

const cleanGit = (argv: readonly string[]) =>
  argv[0] === 'git' ? { exitCode: 0, stdout: '## main...origin/main\n' } : { exitCode: 1, stdout: '' }
const dirtyGit = (argv: readonly string[]) =>
  argv[0] === 'git' ? { exitCode: 0, stdout: '## main...origin/main [ahead 2]\n M a\n' } : { exitCode: 1, stdout: '' }

type CommandEvent = { name: string; description?: string; argumentHint?: string }

const START = { source: 'startup', cwd: CWD } as never

for (const lang of ['es', undefined]) {
  test(`session.start registers closing-checklist (never checklist or cierre), opens the pane and handles closing-checklist; lang ${lang ?? 'unset'}`, async ($, on) => {
    const engine = fakeEngine(on, cleanGit, lang)
    await $.session.start(START)
    expect(engine.registered).toContain('closing-checklist')
    expect(engine.registered).not.toContain('cierre')
    expect(engine.registered).not.toContain('checklist')
    const reply = await $.command.run({ command: 'closing-checklist' } as never)
    expect(reply.text).toBeDefined()
    expect(reply.text).not.toContain('/cierre')
  })
}

test('es: the command reply is the Spanish text', async ($, on) => {
  fakeEngine(on, cleanGit, 'es')
  await $.session.start(START)
  const reply = await $.command.run({ command: 'closing-checklist' } as never)
  expect(reply.text).toBe('Panel de checklist abierto.')
})

test('en: the command reply is not the Spanish text', async ($, on) => {
  fakeEngine(on, cleanGit)
  await $.session.start(START)
  const reply = await $.command.run({ command: 'closing-checklist' } as never)
  expect(reply.text).not.toBe('Panel de checklist abierto.')
})

test('the old cierre command is no longer handled', async ($, on) => {
  const engine = fakeEngine(on, cleanGit, 'es')
  await $.session.start(START)
  expect(engine.registered).not.toContain('cierre')
})

test('a Bash call that ran is tracked; a denied or failed one is not', async ($, on) => {
  const engine = fakeEngine(on, cleanGit)
  const command = 'docker run -d --name pg postgres'
  engine.answerToolWith({ deny: 'no' })
  await $.tool.call({ tool: 'Bash', command } as never)
  engine.answerToolWith({ result: 'boom', isError: true })
  await $.tool.call({ tool: 'Bash', command } as never)
  expect(engine.tracked()?.containers ?? []).toEqual([])
  engine.answerToolWith({ result: 'ok' })
  await $.tool.call({ tool: 'Bash', command } as never)
  expect(engine.tracked()?.containers).toEqual([{ name: 'pg', image: 'postgres' }])
})

test('tools other than Bash, PowerShell and Write are not tracked', async ($, on) => {
  const engine = fakeEngine(on, cleanGit)
  await $.tool.call({ tool: 'Read', command: 'docker run -d --name pg postgres' } as never)
  expect(engine.tracked()).toBeUndefined()
})

test('a Write outside the project is tracked after it succeeded', async ($, on) => {
  const engine = fakeEngine(on, cleanGit)
  await $.tool.call({ tool: 'Write', file_path: 'C:\\other\\a.txt', content: 'x' } as never)
  expect(engine.tracked()?.files).toEqual(['C:/other/a.txt'])
})

test('es: session.end toasts the pending count pointing to /closing-checklist and costs one git process when dirty', async ($, on) => {
  const engine = fakeEngine(on, dirtyGit, ' ES ')
  await $.session.start(START)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sid', resume: {} } as never)
  expect(engine.toasts).toEqual(['2 pendientes · revisa /closing-checklist'])
  expect(engine.processes).toEqual(['git status --porcelain=v1 --branch'])
})

test('en: session.end toasts the pending count and /closing-checklist, not the Spanish text', async ($, on) => {
  const engine = fakeEngine(on, dirtyGit)
  await $.session.start(START)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sid', resume: {} } as never)
  expect(engine.toasts.length).toBe(1)
  expect(engine.toasts[0]).toContain('2')
  expect(engine.toasts[0]).toContain('/closing-checklist')
  expect(engine.toasts[0]).not.toContain('/cierre')
  expect(engine.toasts[0]).not.toContain('pendiente')
})

test('es: a single pending item uses the singular wording', async ($, on) => {
  const engine = fakeEngine(on, (argv: readonly string[]) =>
    argv[0] === 'git' ? { exitCode: 0, stdout: '## main...origin/main [ahead 1]\n' } : { exitCode: 1, stdout: '' }, 'es')
  await $.session.start(START)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sid', resume: {} } as never)
  expect(engine.toasts).toEqual(['1 pendiente · revisa /closing-checklist'])
})

test('a value other than es (es-CL) toasts in English', async ($, on) => {
  const engine = fakeEngine(on, dirtyGit, 'es-CL')
  await $.session.start(START)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sid', resume: {} } as never)
  expect(engine.toasts[0]).not.toContain('pendiente')
})

test('a rejecting env.get leaves the mod working in English', async ($, on) => {
  const engine = fakeEngine(on, dirtyGit, 'reject')
  await $.session.start(START)
  expect(engine.registered).toContain('closing-checklist')
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sid', resume: {} } as never)
  expect(engine.toasts.length).toBe(1)
  expect(engine.toasts[0]).not.toContain('pendiente')
})

test('session.end stays silent when everything is clean, and runs nothing after /clear', async ($, on) => {
  const engine = fakeEngine(on, cleanGit)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sid', resume: {} } as never)
  expect(engine.toasts).toEqual([])
  await $.session.end({ reason: 'clear', sessionId: 'sid', resume: {} } as never)
  expect(engine.toasts).toEqual([])
})

test('the pane draws a refresh button armed on the r hotkey', async ($, on) => {
  fakeEngine(on, cleanGit)
  const tree = await $.ui.render({ surface: 'terminal', component: 'Pane', requestId: 'close-checklist', props: {} } as never)
  const buttons: { props: { hotkey?: string; label?: string } }[] = []
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const element = node as { type?: string; children?: unknown }
    if (element.type === 'Button') buttons.push(element as never)
    const children = element.children
    for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) walk(child)
  }
  walk(tree)
  expect(buttons.map(button => button.props.hotkey)).toEqual(['r'])
})

// Texts of a freshly rendered pane, which has no data yet.
async function emptyPaneText($: Parameters<Parameters<typeof test>[1]>[0], on: On, lang?: string) {
  fakeEngine(on, cleanGit, lang)
  await $.session.start(START)
  const tree = await $.ui.render({ surface: 'terminal', component: 'Pane', requestId: 'close-checklist', props: {} } as never)
  return JSON.stringify(tree)
}

test('es: the empty pane prompts in Spanish', async ($, on) => {
  expect(await emptyPaneText($, on, 'es')).toContain('Sin datos. Presiona r para actualizar.')
})

test('en: the empty pane prompts in English, not Spanish', async ($, on) => {
  const text = await emptyPaneText($, on)
  expect(text).not.toContain('Sin datos')
  expect(text).toContain('"r"')
})

// The description and hint of the registered command, checked against the language table without naming its keys.
const table = (lang: 'en' | 'es') => Object.values(messages[lang]) as unknown[]

for (const [lang, other] of [['es', 'en'], ['en', 'es']] as const) {
  test(`${lang}: the closing-checklist command keeps its name while description and hint are the ${lang} texts`, async ($, on) => {
    const engine = fakeEngine(on, cleanGit, lang === 'es' ? 'es' : undefined)
    await $.session.start(START)
    const [command] = engine.commands.filter(registered => registered.name === 'closing-checklist')
    expect(command).toBeDefined()
    expect(table(lang)).toContain(command!.description)
    expect(table(other)).not.toContain(command!.description)
    if (command!.argumentHint !== undefined) expect(table(other)).not.toContain(command!.argumentHint)
  })
}

// Pressing the refresh button must recompute the sections and redraw the mounted pane.
test('pressing the refresh button recomputes and redraws the mounted pane', async ($, on) => {
  let answer = cleanGit
  fakeEngine(on, argv => answer(argv), undefined, false)
  await $.session.start(START)
  await $.command.run({ command: 'closing-checklist' } as never)
  const pane = await $.ui.mount({ plugin: 'close-checklist', surface: 'terminal', component: 'Pane', requestId: 'close-checklist', props: {} } as never)
  expect(await pane.find({ type: 'Text', text: /^\d+ unpushed/ })).toBeUndefined()

  answer = dirtyGit
  await pane.press({ key: '↻ refresh' })

  let redrawn = await pane.find({ type: 'Text', text: /^2 unpushed/ })
  for (let attempt = 0; attempt < 20 && redrawn === undefined; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 50))
    redrawn = await pane.find({ type: 'Text', text: /^2 unpushed/ })
  }
  expect(redrawn).toBeDefined()
  await pane.unmount()
})
