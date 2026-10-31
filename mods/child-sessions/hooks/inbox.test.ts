import { expect, test } from 'claude-code/testing'

import type { Peer } from '../types'
import { capDismissed, clampLines, fullText, isQuestion, isWaiting, replyInstruction, waitingPeers } from './inbox'

const peer = (key: string, lastAt: number, lastDirection: 'in' | 'out', asked = false): Peer =>
  ({ key, name: key, aliases: [key], received: 1, sent: 1, lastAt, lastDirection, asked })

test('a question mark or a decision word reads as a question', async () => {
  expect(isQuestion('¿apilo sobre #553 o espero')).toBe(true)
  expect(isQuestion('listo, ok?')).toBe(true)
  expect(isQuestion('tengo una duda con el merge')).toBe(true)
  expect(isQuestion('Confirma el tag antes')).toBe(true)
  expect(isQuestion('PR abierto, tests verdes')).toBe(false)
  expect(isQuestion('Should I rebase onto main')).toBe(true)
  expect(isQuestion('Please confirm the tag before I deploy')).toBe(true)
  expect(isQuestion('Want me to open the PR')).toBe(true)
})

test('a question mark inside a URL or the envelope tag does not read as a question', async () => {
  expect(isQuestion('mira https://x.dev/a?id=1&b=2')).toBe(false)
  expect(isQuestion('<cross-session-message from="uds:x?y" from-name="n">listo</cross-session-message>')).toBe(false)
  expect(isQuestion('<cross-session-message from="a">¿va?</cross-session-message>')).toBe(true)
})

test('dismissed keeps only the most recent entries', async () => {
  expect(capDismissed({ a: 1, b: 3, c: 2 }, 2)).toEqual({ b: 3, c: 2 })
  expect(capDismissed({ a: 1 }, 2)).toEqual({ a: 1 })
})

test('dismissing hides a waiting peer until a newer inbound message', async () => {
  const list = [peer('a', 10, 'in', true), peer('b', 5, 'in')]
  expect(waitingPeers(list, { a: 10 }).map(p => p.key)).toEqual(['b'])
  expect(waitingPeers([peer('a', 11, 'in')], { a: 10 }).map(p => p.key)).toEqual(['a'])
})

test('only a peer whose last message was inbound and not dismissed waits', async () => {
  expect(isWaiting(peer('a', 10, 'in'), {})).toBe(true)
  expect(isWaiting(peer('a', 10, 'out'), {})).toBe(false)
  expect(isWaiting(peer('a', 10, 'in'), { a: 10 })).toBe(false)
  expect(isWaiting(peer('a', 11, 'in'), { a: 10 })).toBe(true)
})

test('questions come first, then the most recent', async () => {
  const list = [peer('old-q', 1, 'in', true), peer('new', 9, 'in'), peer('new-q', 5, 'in', true), peer('sent', 20, 'out')]
  expect(waitingPeers(list, {}).map(p => p.key)).toEqual(['new-q', 'old-q', 'new'])
})

test('the full text drops the envelope, keeps line breaks and is capped', async () => {
  expect(fullText('<cross-session-message from="a">\n uno\ndos \n</cross-session-message>')).toBe('uno\ndos')
  expect(fullText('<cross-session-message from="a"> </cross-session-message>')).toBeUndefined()
  const long = fullText('z'.repeat(10000)) ?? ''
  expect(long.length).toBe(4000)
  expect(long.endsWith('…')).toBe(true)
})

test('clampLines keeps the first lines and marks the cut', async () => {
  expect(clampLines('a\nb\nc', 2)).toBe('a\nb\n…')
  expect(clampLines('a\nb', 2)).toBe('a\nb')
})

test('the reply instruction names the tool that can reach the peer', () => {
  expect(replyInstruction({ name: 'P3-c', key: 'uds:pipe' })).toContain('SendMessage with to: uds:pipe')
  expect(replyInstruction({ name: 'P3-c', key: 'local_abc' })).toContain('session_id: local_abc')
})
