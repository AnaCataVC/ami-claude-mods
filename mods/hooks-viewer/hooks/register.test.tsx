import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'hooks-viewer',
  component: 'Pane',
  requestId: 'hooks-viewer',
  props: { title: 'Hooks & Mods', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const MANIFEST = '{ "name": "demo-mod", "version": "0.3.0", "description": "x" }'

function fakeEngine(on: On) {
  const store = new Map<string, unknown>()
  const opened: string[] = []
  let version = 0
  on('state.get', async (_$, e) => ({ value: { value: store.get(e.key), version } }) as never)
  on('state.set', async (_$, e) => {
    store.set(e.key, (e as unknown as { value: unknown }).value)
    version += 1
    return { value: { isSet: true, version } } as never
  })
  on('settings.read', async () => ({ value: { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'pwsh', args: ['-File', 'C:/h/stop.ps1'] }] }] } } }) as never)
  on('env.get', async () => ({ value: 'C:\\mods\\demo-mod' }) as never)
  on('fs.read', async () => ({ value: MANIFEST }) as never)
  on('command.register', async () => ({ value: { isRegistered: true } }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.open', async (_$, e) => {
    opened.push((e as unknown as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  return { opened }
}

test('session start opens the pane by itself and the pane lists hooks and mods on every surface', async ($, on) => {
  const engine = fakeEngine(on)
  await $.session.start({ source: 'startup', cwd: '/' } as never)
  expect(engine.opened).toEqual(['hooks-viewer'])

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /stop\.ps1/ }))?.text).toContain('stop.ps1')
    expect((await ui.find({ type: 'Text', text: /demo-mod/ }))?.text).toContain('v0.3.0')
    await ui.unmount()
  }
})

test('the command replies with the listing as text', async ($, on) => {
  fakeEngine(on)
  const reply = await $.command.run({ command: 'hooks-panel' } as never)
  expect(reply.text).toContain('Hooks (5)')
  expect(reply.text).toContain('[*] stop.ps1')
  expect(reply.text).toContain('demo-mod v0.3.0')
})

test('an empty pane says so instead of drawing nothing', async ($, on) => {
  on('state.get', () => ({ value: { value: undefined, version: 0 } }) as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /No hooks/ }))?.text).toBeDefined()
  await ui.unmount()
})
