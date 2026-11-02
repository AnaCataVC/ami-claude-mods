import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { Peer } from '../types'
import { waitingPeers } from './inbox'

type TestEngine = Parameters<TestBody>[0]

const PLUGIN = 'child-sessions'
const ADDRESS = 'uds:\\\\.\\pipe\\LOCAL\\cc-msg-53f4'
const OTHER = 'uds:\\\\.\\pipe\\LOCAL\\cc-msg-9a01'
const ENGINE_BAND = 'engine-band'
const SURFACES = ['terminal', 'desktop'] as const
const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 },
} as const

const envelope = (from: string, name: string, body = 'done') =>
  `<cross-session-message from="${from}" from-session="local_${name}" from-name="${name}" from-mode="prompting">${body}</cross-session-message>`

type Calls = { opens: unknown[]; submits: string[]; copies: string[]; toasts: string[]; state: Map<string, unknown> }

function fakeEngine(on: On, options: { subagentIds?: string[]; dropSubmit?: boolean } = {}): Calls {
  const calls: Calls = { opens: [], submits: [], copies: [], toasts: [], state: new Map() }
  on('state.set', async (_$, e, next) => {
    calls.state.set(e.key, (e as unknown as { value: unknown }).value)
    return next(e)
  })
  on('ui.render', async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key={ENGINE_BAND} />
  })
  on('tool.call', async () => ({ result: 'ok' }) as never)
  on('ui.open', async (_$, e) => {
    calls.opens.push(e)
    return { value: { isPlaced: true } } as never
  })
  on('prompt.submit', async (_$, e) => {
    calls.submits.push(e.text)
    return (options.dropSubmit ? { drop: 'no session' } : { text: e.text }) as never
  })
  on('ui.copy', async (_$, e) => {
    calls.copies.push(e.text)
    return { value: { isCopied: true } } as never
  })
  on('ui.toast', async (_$, e) => {
    calls.toasts.push(e.text)
    return { value: undefined } as never
  })
  on('agent.list', async () =>
    ({ value: (options.subagentIds ?? []).map(id => ({ id, description: 'Review', type: 'x', status: 'running' })) }) as never)
  on('session.receive', async (_$, e) => ({ text: e.text }) as never)
  return calls
}

const rows = (calls: Calls) => (calls.state.get('peers') as Peer[] | undefined) ?? []

const receive = ($: TestEngine, from: string, name: string, body?: string) =>
  $.session.receive({ origin: { kind: 'peer' }, text: envelope(from, name, body) } as never)

const mountBand = ($: TestEngine, surface: (typeof SURFACES)[number]) =>
  $.ui.mount({ ...BAND, surface, props: BAND.props as never })

test('a reply and sends to the same session share one row named by from-name', async ($, on) => {
  const calls = fakeEngine(on)
  await $.tool.call({ tool: 'SendMessage', to: 'Review [6054ca]', message: 'hi' } as never)
  await receive($, ADDRESS, 'Review')
  await $.tool.call({ tool: 'SendMessage', to: ADDRESS, message: 'again' } as never)
  const list = rows(calls)
  expect(list.length).toBe(1)
  expect(list[0]).toMatchObject({ name: 'Review', key: ADDRESS, sent: 2, received: 1 })
})

test('a message without a cross-session envelope is not counted', async ($, on) => {
  const calls = fakeEngine(on)
  await $.session.receive({ origin: { kind: 'peer' }, text: 'plain text' } as never)
  expect((rows(calls)).length).toBe(0)
})

test('own subagents are ignored by exact id or name, not by description', async ($, on) => {
  const calls = fakeEngine(on, { subagentIds: ['a1b2c3'] })
  await $.tool.call({ tool: 'Agent', name: 'scout', description: 'Review', prompt: 'x' } as never)
  await $.tool.call({ tool: 'SendMessage', to: 'a1b2c3', message: 'm' } as never)
  await $.tool.call({ tool: 'SendMessage', to: 'scout', message: 'm' } as never)
  await $.tool.call({ tool: 'SendMessage', to: 'Review', message: 'm' } as never)
  expect((rows(calls)).map(peer => peer.name)).toEqual(['Review'])
})

test('the last message either way is kept as a collapsed, truncated preview', async ($, on) => {
  const calls = fakeEngine(on)
  await receive($, ADDRESS, 'Review')
  expect((rows(calls))[0]?.lastMessage).toBe('done')
  await $.tool.call({ tool: 'SendMessage', to: ADDRESS, message: `line one\n\n${'x'.repeat(200)}` } as never)
  const last = (rows(calls))[0]?.lastMessage ?? ''
  expect(last.startsWith('line one x')).toBe(true)
  expect(last.length).toBe(80)
})

test('an inbound message longer than the excerpt is also stored whole, line breaks kept', async ($, on) => {
  const calls = fakeEngine(on)
  const body = `line one\n${'y'.repeat(300)}`
  await receive($, ADDRESS, 'Review', body)
  const [peer] = rows(calls)
  expect(peer?.lastMessage?.length).toBe(80)
  expect(peer?.lastMessageFull).toBe(body)
  await $.tool.call({ tool: 'SendMessage', to: ADDRESS, message: 'ok' } as never)
  expect((rows(calls))[0]?.lastMessageFull).toBeUndefined()
})

test('an inbound question flags the peer and a reply clears its waiting state', async ($, on) => {
  const calls = fakeEngine(on)
  await receive($, ADDRESS, 'Review', 'Should I rebase or wait?')
  expect((rows(calls))[0]).toMatchObject({ asked: true, lastDirection: 'in' })
  expect(waitingPeers(rows(calls), {}).length).toBe(1)
  await $.tool.call({ tool: 'SendMessage', to: ADDRESS, message: 'rebase' } as never)
  expect(waitingPeers(rows(calls), {}).length).toBe(0)
})

test('a send through the session-management tool records the outbound contact', async ($, on) => {
  const calls = fakeEngine(on)
  await $.tool.call({ tool: 'mcp__ccd_session_mgmt__send_message', session_id: 'local_70c1', message: 'hello' } as never)
  expect((rows(calls))[0]).toMatchObject({ key: 'local_70c1', sent: 1, received: 0, lastMessage: 'hello' })
})

test('a URL query string in the envelope body is not a question', async ($, on) => {
  const calls = fakeEngine(on)
  await receive($, ADDRESS, 'Review', 'check https://example.com/p?id=1')
  expect((rows(calls))[0]?.asked).toBe(false)
})

test('rows sharing any alias with a contact merge into one', async ($, on) => {
  const calls = fakeEngine(on)
  await $.tool.call({ tool: 'SendMessage', to: 'Review', message: 'a' } as never)
  await $.tool.call({ tool: 'SendMessage', to: 'local_Review', message: 'b' } as never)
  expect((rows(calls)).length).toBe(2)
  await receive($, ADDRESS, 'Review')
  const list = rows(calls)
  expect(list.length).toBe(1)
  expect(list[0]).toMatchObject({ key: ADDRESS, sent: 2, received: 1 })
  expect(list[0]?.aliases).toEqual(expect.arrayContaining(['Review', 'local_Review', ADDRESS]))
})

test('the band lists questions before reports, even older ones', async ($, on) => {
  const calls = fakeEngine(on)
  await receive($, ADDRESS, 'Review', 'Should I wait or deploy?')
  await receive($, OTHER, 'Deploy', 'PR open, tests green')
  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)
    const replies = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('reply:'))
    expect(replies.map(b => b.key)).toEqual([`reply:${ADDRESS}`, `reply:${OTHER}`])
    const question = await ui.find({ type: 'Text', text: /^\? Review/ })
    expect(question?.props.color).toBe('yellow')
    expect(await ui.find({ type: 'Text', text: /^↙ Deploy/ })).toBeDefined()
    await ui.unmount()
  }
})

test('reply submits the reply instruction and dismisses the peer', async ($, on) => {
  const calls = fakeEngine(on)
  for (const surface of SURFACES) {
    await receive($, ADDRESS, 'Review', `Should I deploy? (${surface})`)
    const ui = await mountBand($, surface)
    await ui.press({ key: `reply:${ADDRESS}` })
    expect(calls.submits.at(-1)).toContain(`Read the latest message from Review and reply to it`)
    expect(calls.copies.length).toBe(0)
    const [peer] = rows(calls)
    expect((calls.state.get('dismissed') as Record<string, number> | undefined)?.[ADDRESS]).toBe(peer?.lastAt)
    expect(await ui.find({ key: `reply:${ADDRESS}` })).toBeUndefined()
    await ui.unmount()
  }
})

test('reply copies the instruction when prompt drops it, keeping peer waiting', async ($, on) => {
  const calls = fakeEngine(on, { dropSubmit: true })
  await receive($, ADDRESS, 'Review', 'Should I wait?')
  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)
    await ui.press({ key: `reply:${ADDRESS}` })
    expect(calls.copies.at(-1)).toContain(`Read the latest message from Review and reply to it`)
    expect(calls.toasts.at(-1)).toContain('copiada al portapapeles')
    expect(await ui.find({ key: `reply:${ADDRESS}` })).toBeDefined()
    await ui.unmount()
  }
})

test('view shows full message and hide closes it', async ($, on) => {
  const calls = fakeEngine(on)
  const body = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
  await receive($, ADDRESS, 'Review', body)
  for (const surface of SURFACES) {
    const ui = await mountBand($, surface)
    expect((await ui.find({ key: `view:${ADDRESS}` }))?.props.label).toBe('ver')
    await ui.press({ key: `view:${ADDRESS}` })
    const shown = await ui.find({ type: 'Text', text: /^line 1\n/ })
    expect(shown?.text).toBe([...body.split('\n').slice(0, 12), '…'].join('\n'))
    expect((await ui.find({ key: `view:${ADDRESS}` }))?.props.label).toBe('ocultar')
    await ui.press({ key: `view:${ADDRESS}` })
    expect(await ui.find({ type: 'Text', text: /^line 1\n/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('each row replies by its digit and only the top row takes letter hotkeys', async ($, on) => {
  fakeEngine(on)
  await receive($, ADDRESS, 'Review', 'Should I wait or deploy?')
  await receive($, OTHER, 'Deploy', 'PR open, tests green')
  const ui = await mountBand($, 'terminal')
  expect((await ui.find({ key: `reply:${ADDRESS}` }))?.props.hotkey).toBe('1')
  expect((await ui.find({ key: `reply:${OTHER}` }))?.props.hotkey).toBe('2')
  expect((await ui.find({ key: `done:${ADDRESS}` }))?.props.hotkey).toBe('d')
  expect((await ui.find({ key: `done:${OTHER}` }))?.props.hotkey).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /ctrl\+x tab/ })).toBeDefined()
  await ui.unmount()
})

test('dismiss removes the peer from the band', async ($, on) => {
  const calls = fakeEngine(on)
  await receive($, ADDRESS, 'Review', 'Should I proceed?')
  const ui = await mountBand($, 'desktop')
  await ui.press({ key: `done:${ADDRESS}` })
  expect(await ui.find({ key: `reply:${ADDRESS}` })).toBeUndefined()
  expect(await ui.find({ key: ENGINE_BAND })).toBeDefined()
  await ui.unmount()
})
