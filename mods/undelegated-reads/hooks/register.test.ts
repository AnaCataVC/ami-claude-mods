import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { THRESHOLD, WARN_FROM } from './meter'

const statuses: Array<string | undefined> = []

function fakeEngine(on: On, env: Record<string, string> = {}) {
  mock.env(on, env)
  statuses.length = 0
  on('ui.status', async (_$, e) => {
    statuses.push((e as unknown as { text?: string }).text)
    return { value: undefined } as never
  })
  const store = new Map<string, unknown>()
  let version = 0
  on('state.get', async (_$, e) => ({ value: { value: store.get(e.key), version } }) as never)
  on('state.set', async (_$, e) => {
    store.set(e.key, (e as unknown as { value: unknown }).value)
    version += 1
    return { value: { isSet: true, version } } as never
  })
  on('tool.call', async () => ({ result: 'ok' }) as never)
  on('prompt.submit', async (_$, e) => ({ text: e.text }) as never)
  return () => store.get('count') as number | undefined
}

type Call = { tool: string; agentId?: string }
const isBlocked = (result: { deny?: string }) => result.deny !== undefined

test('counts reads, blocks exactly at the threshold and restarts from 0', async ($, on) => {
  const count = fakeEngine(on)
  for (let i = 1; i < THRESHOLD; i += 1) {
    expect(isBlocked(await $.tool.call({ tool: 'Read', file_path: 'a' } as never))).toBe(false)
    expect(count()).toBe(i)
  }
  const blocked = await $.tool.call({ tool: 'Grep', pattern: 'x' } as never)
  expect(isBlocked(blocked)).toBe(true)
  expect(blocked.deny).toBe(`${THRESHOLD} consecutive mechanical reads without delegating: dispatch to an exploration subagent or proceed (counter resets).`)
  expect(count()).toBe(0)
  expect(isBlocked(await $.tool.call({ tool: 'Glob', pattern: '*' } as never))).toBe(false)
  expect(count()).toBe(1)
})

test('status stays undefined below WARN_FROM and shows the gauge from WARN_FROM', async ($, on) => {
  fakeEngine(on)
  for (let i = 1; i < WARN_FROM; i += 1) {
    await $.tool.call({ tool: 'Read', file_path: 'a' } as never)
    expect(statuses[statuses.length - 1]).toBeUndefined()
  }
  await $.tool.call({ tool: 'Read', file_path: 'a' } as never)
  expect(statuses[statuses.length - 1]).toBe(`lecturas sin delegar ▰▰▰▰▰▰▰▱▱▱ ${WARN_FROM}/${THRESHOLD}`)
})

test('Agent and Task reset the count; other tools do not count', async ($, on) => {
  const count = fakeEngine(on)
  await $.tool.call({ tool: 'Read', file_path: 'a' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'a' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(count()).toBe(2)
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' } as never)
  expect(count()).toBe(0)
  await $.tool.call({ tool: 'Read', file_path: 'a' } as never)
  await $.tool.call({ tool: 'Task', description: 'd', prompt: 'p' } as never)
  expect(count()).toBe(0)
})

test('calls from a subagent loop are neither counted nor blocked', async ($, on) => {
  const count = fakeEngine(on)
  const subagentRead = { tool: 'Read', file_path: 'a', agentId: 'sub1' } as Call
  for (let i = 0; i < THRESHOLD + 2; i += 1) {
    expect(isBlocked(await $.tool.call(subagentRead as never))).toBe(false)
  }
  expect(count()).toBeUndefined()
})

test('a session started by the harness (CAD_AGENT_ID) is neither counted nor blocked', async ($, on) => {
  const count = fakeEngine(on, { CAD_AGENT_ID: 'cad-1' })
  for (let i = 0; i < THRESHOLD + 2; i += 1) {
    expect(isBlocked(await $.tool.call({ tool: 'Read', file_path: 'a' } as never))).toBe(false)
  }
  expect(count()).toBeUndefined()
})

test('searching shell commands count; a typed prompt resets the streak, a meta prompt does not', async ($, on) => {
  const count = fakeEngine(on)
  await $.tool.call({ tool: 'Bash', command: 'grep -rn foo src' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git status' } as never)
  expect(count()).toBe(1)
  await $.prompt.submit({ text: 'x', isMeta: true } as never)
  expect(count()).toBe(1)
  await $.prompt.submit({ text: 'next turn' } as never)
  expect(count()).toBe(0)
})
