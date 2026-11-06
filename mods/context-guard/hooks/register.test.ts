import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

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

const PROFILE_CONFIG = JSON.stringify({
  profiles: [{ path: 'C:/work/projects', expectedGhUser: 'work-dev', label: 'Work' }],
  warnProductionKube: true,
})

// Engine with a gh account, a kube context and a profile config, capturing the status line.
function statusEngine(on: On, options: { lang?: string | 'reject'; gh: string; kube: string; config?: string }) {
  const statuses: Array<string | undefined> = []
  const files: Record<string, string> = {
    'hosts.yml': `github.com:\n    user: ${options.gh}\n`,
    config: `current-context: ${options.kube}\n`,
    'context-guard.json': options.config ?? PROFILE_CONFIG,
  }
  const store = new Map<string, unknown>()
  let version = 0
  on('state.get', async (_$, e) => ({ value: { value: store.get(e.key), version } }) as never)
  on('state.set', async (_$, e) => {
    store.set(e.key, (e as unknown as { value: unknown }).value)
    version += 1
    return { value: { isSet: true, version } } as never
  })
  on('session.cwd', async () => ({ value: 'C:\\work\\projects\\app' }) as never)
  on('clock.now', async () => ({ value: 1_000_000 }) as never)
  if (options.lang === 'reject') {
    on('env.get', async (_$, e) => {
      if ((e as unknown as { name: string }).name === 'CLAUDE_MODS_LANG') throw new Error('env unavailable')
      return { value: (e as unknown as { name: string }).name === 'HOME' ? 'C:/home' : undefined } as never
    })
  } else {
    mock.env(on, { HOME: 'C:/home', ...(options.lang === undefined ? {} : { CLAUDE_MODS_LANG: options.lang }) })
  }
  on('fs.read', async (_$, e) => {
    const key = Object.keys(files).find(name => e.path.endsWith(name))
    return { value: key === undefined ? null : files[key] } as never
  })
  on('ui.status', async (_$, e) => {
    statuses.push((e as unknown as { text?: string }).text)
    return { value: undefined } as never
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }) as never)
  on('tool.call', async () => ({ result: 'ok' }) as never)
  return () => statuses[statuses.length - 1]
}

const start = ($: Parameters<Parameters<typeof test>[1]>[0]) => $.session.start({ source: 'startup', cwd: 'C:\\work\\projects\\app' } as never)

test('es: the status line flags a mismatching account and a production cluster in Spanish', async ($, on) => {
  const lastStatus = statusEngine(on, { lang: 'es', gh: 'other-user', kube: 'prod-cluster' })
  await start($)
  expect(lastStatus()).toBe('✕ other-user · ⚠ prod-cluster')
})

test('es (case and whitespace insensitive): a matching account reads as ok', async ($, on) => {
  const lastStatus = statusEngine(on, { lang: ' ES ', gh: 'work-dev', kube: 'staging-ctx' })
  await start($)
  expect(lastStatus()).toBe('✓ Work · staging-ctx')
})

test('en: the status line carries the account and cluster but not the Spanish wording', async ($, on) => {
  const lastStatus = statusEngine(on, { gh: 'other-user', kube: 'prod-cluster' })
  await start($)
  expect(lastStatus()).toContain('other-user')
  expect(lastStatus()).toContain('prod-cluster')
  expect(lastStatus()).not.toContain('no coincide')
})

test('a value other than es (es-CL) shows the English status', async ($, on) => {
  const lastStatus = statusEngine(on, { lang: 'es-CL', gh: 'other-user', kube: 'prod-cluster' })
  await start($)
  expect(lastStatus()).not.toContain('no coincide')
})

test('a rejecting env.get keeps the status line and the guard working in English', async ($, on) => {
  const lastStatus = statusEngine(on, { lang: 'reject', gh: 'other-user', kube: 'prod-cluster' })
  await start($)
  expect(lastStatus()).toContain('other-user')
  expect(lastStatus()).not.toContain('no coincide')
  const result = await $.tool.call({ tool: 'Bash', command: 'kubectl get pods' } as never)
  expect(result.deny).toContain('--context')
})
