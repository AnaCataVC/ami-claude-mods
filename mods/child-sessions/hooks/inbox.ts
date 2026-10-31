import type { Peer } from '../types'

export const BAND_MAX_LINES = 3
export const MAX_PEERS = 50
export const MAX_SUBAGENT_NAMES = 100

const PREVIEW_CHARS = 80
const FULL_MESSAGE_CHARS = 4000
const SESSION_ADDRESS = /^uds:/
const ENVELOPE_TAG = /<\/?cross-session-message\b[^>]*>/g
const QUESTION = /¿|\?(?=$|[\s)\]"'”])|\b(duda|pregunta|decide|decidir|decides|confirma|confirmar|confirmas|should (i|we)|do you want|would you like|want me to|please confirm|need your (decision|input|approval))\b/i

export type Contact = { key: string; name: string; aliases: string[] }
export type Dismissed = Record<string, number>

export function stripEnvelope(text: string): string {
  return text.replace(ENVELOPE_TAG, '')
}

export function isQuestion(text: string): boolean {
  return QUESTION.test(stripEnvelope(text))
}

export function preview(text: string): string | undefined {
  const flat = stripEnvelope(text).replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS - 1)}…` : flat
}

export function fullText(text: string): string | undefined {
  const body = stripEnvelope(text).trim()
  if (!body) return undefined
  return body.length > FULL_MESSAGE_CHARS ? `${body.slice(0, FULL_MESSAGE_CHARS - 1)}…` : body
}

export function clampLines(text: string, max: number): string {
  const lines = text.split(/\r?\n/)
  return lines.length > max ? [...lines.slice(0, max), '…'].join('\n') : text
}

export function replyInstruction(peer: Pick<Peer, 'name' | 'key'>): string {
  const how = peer.key.startsWith('local_')
    ? `Use session messaging tool with session_id: ${peer.key} (e.g. mcp__ccd_session_mgmt__send_message)`
    : `Use SendMessage with to: ${peer.key}`
  return `Read the latest message from ${peer.name} and reply to it.\n${how}`
}

export function isWaiting(peer: Peer, dismissed: Dismissed): boolean {
  return peer.lastDirection === 'in' && (dismissed[peer.key] ?? -1) < peer.lastAt
}

export function waitingPeers(peers: Peer[], dismissed: Dismissed): Peer[] {
  return peers
    .filter(peer => isWaiting(peer, dismissed))
    .sort((a, b) => Number(!!b.asked) - Number(!!a.asked) || b.lastAt - a.lastAt)
}

export function capDismissed(dismissed: Dismissed, max: number): Dismissed {
  const entries = Object.entries(dismissed)
  if (entries.length <= max) return dismissed
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, max))
}

function mergeRows(rows: Peer[]): Peer {
  const [latest, ...older] = [...rows].sort((a, b) => b.lastAt - a.lastAt) as [Peer, ...Peer[]]
  const address = rows.find(row => SESSION_ADDRESS.test(row.key))
  return {
    ...latest,
    key: address?.key ?? latest.key,
    aliases: [...new Set(rows.flatMap(row => row.aliases))],
    received: latest.received + older.reduce((sum, row) => sum + row.received, 0),
    sent: latest.sent + older.reduce((sum, row) => sum + row.sent, 0),
  }
}

export function applyContact(
  list: Peer[],
  who: Contact,
  direction: 'in' | 'out',
  message: string | undefined,
  now: number,
): Peer[] {
  const matches = list.filter(peer => peer.aliases.some(alias => who.aliases.includes(alias)))
  const base: Peer = matches.length
    ? mergeRows(matches)
    : { ...who, received: 0, sent: 0, lastAt: 0, lastDirection: direction }
  const isInbound = direction === 'in'
  const next: Peer = {
    ...base,
    key: isInbound && SESSION_ADDRESS.test(who.key) ? who.key : base.key,
    name: isInbound ? who.name : base.name,
    aliases: [...new Set([...base.aliases, ...who.aliases])],
    received: base.received + (isInbound ? 1 : 0),
    sent: base.sent + (isInbound ? 0 : 1),
    lastAt: now,
    lastDirection: direction,
    lastMessage: (message && preview(message)) ?? base.lastMessage,
    lastMessageFull: isInbound && message ? fullText(message) : undefined,
    asked: isInbound ? !!message && isQuestion(message) : base.asked,
  }
  return [next, ...list.filter(peer => !matches.includes(peer))].slice(0, MAX_PEERS)
}
