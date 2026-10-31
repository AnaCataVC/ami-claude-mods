import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import type { Tracked } from '../types'

const CWD = 'C:\\proj'

function fakeEngine(on: On, processAnswer: (argv: readonly string[]) => { exitCode: number; stdout: string }) {
  const registered: string[] = []
  const store = new Map<string, unknown>()
  const toasts: string[] = []
  const processes: string[] = []
  let version = 0
  let toolAnswer: Record<string, unknown> = { result: 'ok' }
  on('state.get', async (_$, e) => ({ value: { value: store.get(e.key), version } }) as never)
  on('state.set', async (_$, e) => {
    store.set(e.key, (e as unknown as { value: unknown }).value)
    version += 1
    return { value: { isSet: true, version } } as never
  })
  on('session.cwd', async () => ({ value: CWD }) as never)
  on('session.id', async () => ({ value: 'sid' }) as never)
  on('env.get', async () => ({ value: undefined }) as never)
  on('fs.exists', async () => ({ value: false }) as never)
  on('command.register', async (_$, e) => {
    registered.push((e as unknown as { name: string }).name)
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

test('session.start registers the /checklist and /cierre commands and opens the pane', async ($, on) => {
  const engine = fakeEngine(on, cleanGit)
  await $.session.start({ source: 'startup', cwd: CWD } as never)
  expect(engine.registered).toContain('checklist')
  expect(engine.registered).toContain('cierre')
  const reply = await $.command.run({ command: 'checklist' } as never)
  expect(reply.text).toBe('Checklist panel opened.')
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

test('session.end toasts the pending count and costs one git process when dirty', async ($, on) => {
  const engine = fakeEngine(on, dirtyGit)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sid', resume: {} } as never)
  expect(engine.toasts).toEqual(['Before closing: 2 pending items, check /checklist'])
  expect(engine.processes).toEqual(['git status --porcelain=v1 --branch'])
})

test('session.end stays silent when everything is clean, and runs nothing after /clear', async ($, on) => {
  const engine = fakeEngine(on, cleanGit)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sid', resume: {} } as never)
  expect(engine.toasts).toEqual([])
  await $.session.end({ reason: 'clear', sessionId: 'sid', resume: {} } as never)
  expect(engine.toasts).toEqual([])
})
