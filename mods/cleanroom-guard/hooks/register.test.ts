import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

type Setup = { lang?: string | 'reject' }

// Starts the session so the mod reads CLAUDE_MODS_LANG.
async function startSession($: Parameters<Parameters<typeof test>[1]>[0]) {
  await $.session.start({ source: 'startup', cwd: 'C:\\proj' } as never)
}

function fakeEngine(on: On, toasts: string[] = [], clock = { now: 1_000_000 }, setup: Setup = {}) {
  on('env.get', async () => {
    if (setup.lang === 'reject') throw new Error('env unavailable')
    return { value: setup.lang } as never
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('ui.toast' as never, async (_$: unknown, e: { text: string }) => (toasts.push(e.text), { value: {} }) as never)
  on('clock.now' as never, async () => ({ value: clock.now }) as never)
  on('agent.list' as never, async () => ({
    value: [
      { id: 'impl1', type: 'code-implementer-jr' },
      { id: 'tw1', type: 'test-writer-jr' },
      { id: 'builder1', type: 'ami-cleanroom-builder' },
      { id: 'tester1', type: 'ami-cleanroom-tester' },
    ],
  }) as never)
  on('tool.call', async () => ({ result: 'ok' }) as never)
}

test('denies by the calling subagent type, never on the main loop', async ($, on) => {
  fakeEngine(on)
  const read = (file_path: string, agentId?: string) => $.tool.call({ tool: 'Read', file_path, agentId } as never)
  expect((await read('tests/test_x.py', 'impl1')).deny).toBeDefined()
  expect((await read('tests/test_x.py', 'builder1')).deny).toBeDefined()
  expect((await read('src/x.py', 'tw1')).deny).toBeDefined()
  expect((await read('src/x.py', 'tester1')).deny).toBeDefined()
  expect((await read('tests/test_x.py')).deny).toBeUndefined()
})

test('es: toast is Spanish with the basename while the deny reason stays English with the full path', async ($, on) => {
  const toasts: string[] = []
  fakeEngine(on, toasts, undefined, { lang: 'es' })
  await startSession($)
  const result = await $.tool.call({ tool: 'Write', file_path: 'C:\\repo\\src\\app.py', agentId: 'tw1' } as never)
  expect(result.deny).toContain('may only write tests (C:\\repo\\src\\app.py)')
  expect(toasts[0]).toBe('cleanroom: bloqueé a test-writer-jr escribir app.py')
})

test('en: toast names the agent and the basename, differs from Spanish, and the deny reason is unchanged', async ($, on) => {
  const toasts: string[] = []
  fakeEngine(on, toasts, undefined, { lang: undefined })
  await startSession($)
  const result = await $.tool.call({ tool: 'Write', file_path: 'C:\\repo\\src\\app.py', agentId: 'tw1' } as never)
  expect(result.deny).toContain('may only write tests (C:\\repo\\src\\app.py)')
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('test-writer-jr')
  expect(toasts[0]).toContain('app.py')
  expect(toasts[0]).not.toContain('bloqueé')
})

test('a value other than es (es-CL) shows the English toast', async ($, on) => {
  const toasts: string[] = []
  fakeEngine(on, toasts, undefined, { lang: 'es-CL' })
  await startSession($)
  await $.tool.call({ tool: 'Read', file_path: 'tests/test_x.py', agentId: 'impl1' } as never)
  expect(toasts[0]).not.toContain('bloqueé')
})

test('a rejecting env.get leaves the guard working in English', async ($, on) => {
  const toasts: string[] = []
  fakeEngine(on, toasts, undefined, { lang: 'reject' })
  await startSession($)
  const result = await $.tool.call({ tool: 'Read', file_path: 'tests/test_x.py', agentId: 'impl1' } as never)
  expect(result.deny).toBeDefined()
  expect(toasts[0]).not.toContain('bloqueé')
})

test('a block toasts the rule once per window; a later block after the gap toasts again', async ($, on) => {
  const toasts: string[] = []
  const clock = { now: 5_000_000 }
  fakeEngine(on, toasts, clock, { lang: ' ES ' })
  await startSession($)
  const read = () => $.tool.call({ tool: 'Read', file_path: 'tests/test_x.py', agentId: 'impl1' } as never)
  expect((await read()).deny).toBeDefined()
  expect((await read()).deny).toBeDefined()
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toBe('cleanroom: bloqueé a code-implementer-jr leer test_x.py')
  clock.now += 21_000
  await read()
  expect(toasts.length).toBe(2)
  await $.tool.call({ tool: 'Read', file_path: 'src/x.py', agentId: 'impl1' } as never)
  expect(toasts.length).toBe(2)
})
