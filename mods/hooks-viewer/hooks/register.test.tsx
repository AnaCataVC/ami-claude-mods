import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { messages } from './messages'

const PANE = {
  plugin: 'hooks-viewer',
  component: 'Pane',
  requestId: 'hooks-viewer',
  props: { title: 'Hooks y mods', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const MANIFEST = '{ "name": "demo-mod", "version": "0.3.0", "description": "x" }'

// Stands in for the engine: state store, settings files, environment, filesystem and the pane.
// `lang` is the value of CLAUDE_MODS_LANG; undefined leaves it unset.
function fakeEngine(on: On, lang?: string, hasData = true) {
  mock.env(on, { ...(hasData ? { CLAUDE_CODE_PLUGIN_DIRS: 'C:\\mods\\demo-mod' } : {}), ...(lang === undefined ? {} : { CLAUDE_MODS_LANG: lang }) })
  const store = new Map<string, unknown>()
  const opened: string[] = []
  const focused: unknown[] = []
  const registered: string[] = []
  const commands: Array<{ name: string; description?: string; argumentHint?: string }> = []
  let version = 0
  on('state.get', async (_$, e) => ({ value: { value: store.get(e.key), version } }) as never)
  on('state.set', async (_$, e) => {
    store.set(e.key, (e as unknown as { value: unknown }).value)
    version += 1
    return { value: { isSet: true, version } } as never
  })
  on('settings.read', async () => ({ value: { hooks: !hasData ? {} : { Stop: [{ hooks: [{ type: 'command', command: 'pwsh', args: ['-File', 'C:/h/stop.ps1'] }] }] } } }) as never)
  on('fs.read', async () => ({ value: MANIFEST }) as never)
  on('command.register', async (_$, e) => {
    registered.push((e as unknown as { name: string }).name)
    commands.push(e as unknown as { name: string; description?: string; argumentHint?: string })
    return { value: { isRegistered: true } } as never
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.open', async (_$, e) => {
    opened.push((e as unknown as { id: string }).id)
    focused.push((e as unknown as { focus?: boolean }).focus)
    return { value: { isPlaced: true } } as never
  })
  return { opened, focused, registered, commands }
}

const startArgs = { source: 'startup', cwd: '/' } as never

test('es: session start does not open the pane; it lists hooks and mods on every surface', async ($, on) => {
  const engine = fakeEngine(on, 'es')
  await $.session.start(startArgs)
  expect(engine.opened).toEqual([])

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /stop\.ps1/ }))?.text).toContain('stop.ps1')
    expect((await ui.find({ type: 'Text', text: /demo-mod/ }))?.text).toContain('v0.3.0')
    const refresh = await ui.find({ type: 'Button' })
    expect(refresh?.props).toMatchObject({ label: '↻ actualizar', hotkey: 'r', autoFocus: true })
    await ui.unmount()
  }
})

test('es: the command opens the pane focused and replies with the listing as text', async ($, on) => {
  const engine = fakeEngine(on, 'es')
  await $.session.start(startArgs)
  const reply = await $.command.run({ command: 'hooks-panel' } as never)
  expect(engine.opened).toEqual(['hooks-viewer'])
  expect(engine.focused).toEqual([true])
  // The fake answers every source with the same hooks: five sources, five rows.
  expect(reply.text).toContain('Hooks de settings (5)')
  expect(reply.text).toContain('[*] stop.ps1')
  expect(reply.text).toContain('demo-mod v0.3.0')
})

test('es: an empty pane says so instead of drawing nothing', async ($, on) => {
  fakeEngine(on, 'es', false)
  await $.session.start(startArgs)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No hay hooks/ }))?.text).toBeDefined()
  await ui.unmount()
})

type Mounted = Awaited<ReturnType<Parameters<Parameters<typeof test>[1]>[0]['ui']['mount']>>

// Labels of every button and text in the pane, to find the "all" filter chip wherever it is drawn.
const visibleLabels = async (ui: Mounted) => [
  ...(await ui.findAll({ type: 'Button' })).map(node => String(node.props.label)),
  ...(await ui.findAll({ type: 'Text' })).map(node => String(node.text)),
]

test('es: the "all" filter chip is labelled todos while event names stay as-is', async ($, on) => {
  fakeEngine(on, 'es')
  await $.session.start(startArgs)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await visibleLabels(ui)).toContain('todos')
  expect((await ui.find({ type: 'Text', text: /Stop/ }))?.text).toBeDefined()
  await ui.unmount()
})

test('en: the "all" filter chip is labelled all and the refresh button is not the Spanish label', async ($, on) => {
  fakeEngine(on)
  await $.session.start(startArgs)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const labels = await visibleLabels(ui)
  expect(labels).toContain('all')
  expect(labels).not.toContain('todos')
  const refresh = await ui.find({ type: 'Button' })
  expect(refresh?.props).toMatchObject({ hotkey: 'r' })
  expect(refresh?.props.label).not.toBe('↻ actualizar')
  await ui.unmount()
})

test('en: the command reply lists the hooks and mods and is not the Spanish report', async ($, on) => {
  fakeEngine(on)
  await $.session.start(startArgs)
  const reply = await $.command.run({ command: 'hooks-panel' } as never)
  expect(reply.text).toContain('[*] stop.ps1')
  expect(reply.text).toContain('demo-mod v0.3.0')
  expect(reply.text).not.toContain('Hooks de settings')
})

test('a value other than es (es-CL) shows English', async ($, on) => {
  fakeEngine(on, 'es-CL')
  await $.session.start(startArgs)
  const reply = await $.command.run({ command: 'hooks-panel' } as never)
  expect(reply.text).not.toContain('Hooks de settings')
})

for (const lang of ['es', undefined]) {
  test(`the command is registered as hooks-panel with lang ${lang ?? 'unset'}`, async ($, on) => {
    const engine = fakeEngine(on, lang)
    await $.session.start(startArgs)
    expect(engine.registered).toEqual(['hooks-panel'])
  })
}

// The description and hint of the registered command, checked against the language table without naming its keys.
const table = (lang: 'en' | 'es') => Object.values(messages[lang]) as unknown[]

for (const [lang, other] of [['es', 'en'], ['en', 'es']] as const) {
  test(`${lang}: the hooks-panel command keeps its name while description and hint are the ${lang} texts`, async ($, on) => {
    const engine = fakeEngine(on, lang === 'es' ? 'es' : undefined)
    await $.session.start(startArgs)
    
    const [command] = engine.commands.filter(registered => registered.name === 'hooks-panel')
    expect(command).toBeDefined()
    expect(table(lang)).toContain(command!.description)
    expect(table(other)).not.toContain(command!.description)
    if (command!.argumentHint !== undefined) expect(table(other)).not.toContain(command!.argumentHint)
  })
}
