import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

function fakeEngine(on: On) {
  const store = new Map<string, unknown>()
  let version = 0
  on('state.get', async (_$, e) => ({ value: { value: store.get(e.key), version } }) as never)
  on('state.set', async (_$, e) => {
    store.set(e.key, (e as unknown as { value: unknown }).value)
    version += 1
    return { value: { isSet: true, version } } as never
  })
  on('session.cwd', async () => ({ value: 'C:\\workspace\\proj' }) as never)
  on('clock.now', async () => ({ value: 1_000_000 }) as never)
  on('env.get', async () => ({ value: undefined }) as never)
  on('fs.read', async () => ({ value: null }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('tool.call', async () => ({ result: 'ok' }) as never)
}

test('blocks bare kubectl execution', async ($, on) => {
  fakeEngine(on)
  const result = await $.tool.call({ tool: 'Bash', command: 'kubectl get pods' } as never)
  expect(result.deny).toContain('--context')
})

test('allows kubectl with explicit context flag', async ($, on) => {
  fakeEngine(on)
  const result = await $.tool.call({ tool: 'Bash', command: 'kubectl --context staging get pods' } as never)
  expect(result.deny).toBeUndefined()
})
