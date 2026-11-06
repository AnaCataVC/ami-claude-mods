import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Peer } from '../types'
import {
  BAND_MAX_LINES,
  MAX_PEERS,
  MAX_SUBAGENT_NAMES,
  applyContact,
  capDismissed,
  clampLines,
  replyInstruction,
  waitingPeers,
} from './inbox'
import type { Contact } from './inbox'

const peers = atom({ plugin: 'child-sessions', key: 'peers' } as const, [])
const subagentNames = atom({ plugin: 'child-sessions', key: 'subagentNames' } as const, [])
const dismissed = atom({ plugin: 'child-sessions', key: 'dismissed' } as const, {})
const expanded = atom({ plugin: 'child-sessions', key: 'expanded' } as const, [])

const SEND_TO_SESSION = 'mcp__ccd_session_mgmt__send_message'
const PEER_ORIGINS = new Set(['peer', 'peer-send-message'])
const SESSION_ADDRESS = /^uds:/
const EXPANDED_MAX_LINES = 12

type Engine = EngineInterface

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

function senderOf(text: string): Contact | undefined {
  const tag = /<cross-session-message\b[^>]*>/.exec(text)?.[0]
  if (!tag) return undefined
  const address = attribute(tag, 'from')
  const name = attribute(tag, 'from-name')
  const sessionId = attribute(tag, 'from-session')
  const key = address && address !== '...' ? address : (sessionId ?? name)
  if (!key) return undefined
  return { key, name: name ?? sessionId ?? key, aliases: [key, name, sessionId].filter((a): a is string => !!a) }
}

function stripRef(target: string): string {
  return target.replace(/\s*\[[0-9a-f]+\]$/i, '')
}

async function isOwnSubagent($: Engine, target: string): Promise<boolean> {
  if (SESSION_ADDRESS.test(target)) return false
  const [agents, names] = await Promise.all([
    $.agent.list().catch(() => []),
    read($, subagentNames).catch(() => [] as string[]),
  ])
  return agents.some(agent => agent.id === target) || names.includes(target)
}

async function recordContact($: Engine, who: Contact, direction: 'in' | 'out', message?: string) {
  await update($, peers, list => applyContact(list, who, direction, message, Date.now())).catch(() => undefined)
}

async function recordOutbound($: Engine, rawTarget: string, message: unknown) {
  const target = stripRef(rawTarget)
  if (await isOwnSubagent($, target)) return
  const text = typeof message === 'string' ? message : undefined
  await recordContact($, { key: target, name: target, aliases: [target] }, 'out', text)
}

function succeeded(ran: { deny?: unknown; isError?: boolean }): boolean {
  return ran.deny === undefined && ran.isError !== true
}

function ago(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60000)
  return minutes < 1 ? 'recién' : minutes < 60 ? `hace ${minutes}m` : `hace ${Math.floor(minutes / 60)}h`
}

// A bare digit in an empty composer presses a band Button, so digits reach every row
// without focusing the band; letters only work once ctrl+x tab focuses it, so only
// the top row gets them to avoid clashes.
const KEYBOARD_HINT = '1-3 en el prompt vacío responde · ctrl+x tab: v ver, d descartar, tab para moverte'

async function dismiss($: Engine, peer: Peer) {
  await update($, dismissed, map => capDismissed({ ...map, [peer.key]: peer.lastAt }, MAX_PEERS))
  await update($, expanded, keys => keys.filter(key => key !== peer.key))
}

function toggleExpanded($: Engine, peer: Peer) {
  return update($, expanded, keys =>
    keys.includes(peer.key) ? keys.filter(key => key !== peer.key) : [...keys, peer.key].slice(-MAX_PEERS))
}

async function reply($: Engine, peer: Peer, surface: RenderSurface) {
  const text = replyInstruction(peer)
  const result = await $.prompt.submit({ text }).catch(() => undefined)
  if (result && !result.drop) {
    await dismiss($, peer)
    return
  }
  await $.ui.copy({ text, surface })
  $.ui.toast('Instrucción de respuesta copiada al portapapeles: pégala en el prompt')
}

async function renderBand($: Engine, e: Parameters<Engine['ui']['resolve']>[0]) {
  const { Box, Button, Text } = $.ui.resolve(e)
  const waiting = waitingPeers(await read($, peers), await read($, dismissed))
  if (waiting.length === 0) return undefined
  const open = new Set(await read($, expanded))
  const extra = waiting.length - BAND_MAX_LINES
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={waiting.some(peer => peer.asked) ? 'warning' : 'suggestion'}
      borderDimColor
      paddingX={1}
    >
      {waiting.slice(0, BAND_MAX_LINES).map((peer, index) => {
        const full = peer.lastMessageFull ?? peer.lastMessage
        const isOpen = open.has(peer.key) && !!full
        const isTop = index === 0
        return (
          <Box key={peer.key} flexDirection="column">
            <Box>
              <Box flexGrow={1}>
                <Text wrap="truncate-end" color={peer.asked ? 'yellow' : undefined} bold={peer.asked}>
                  {peer.asked ? '? ' : '↙ '}
                  {peer.name}
                  <Text dimColor> · {ago(peer.lastAt)}{peer.lastMessage ? ` · “${peer.lastMessage}”` : ''}</Text>
                </Text>
              </Box>
              <Box gap={1} flexShrink={0}>
                <Button
                  key={`reply:${peer.key}`}
                  label="responder"
                  hotkey={String(index + 1)}
                  plain
                  {...(isTop ? { autoFocus: true as const } : {})}
                  onPress={press => reply($, peer, press.surface)}
                />
                {full && (
                  <Button
                    key={`view:${peer.key}`}
                    label={isOpen ? 'ocultar' : 'ver'}
                    {...(isTop ? { hotkey: 'v' } : {})}
                    plain
                    dimColor
                    onPress={() => toggleExpanded($, peer)}
                  />
                )}
                <Button
                  key={`done:${peer.key}`}
                  label="descartar"
                  {...(isTop ? { hotkey: 'd' } : {})}
                  plain
                  dimColor
                  onPress={() => dismiss($, peer)}
                />
              </Box>
            </Box>
            {isOpen && (
              <Box paddingLeft={2}>
                <Text dimColor wrap="wrap">{clampLines(full, EXPANDED_MAX_LINES)}</Text>
              </Box>
            )}
          </Box>
        )
      })}
      {extra > 0 && <Text dimColor>+{extra} más</Text>}
      <Text dimColor wrap="truncate-end">{KEYBOARD_HINT}</Text>
    </Box>
  )
}

export const register: Register = on => {
  on('session.receive', async ($, e, next) => {
    const origin = e.origin as { kind: string }
    const sender = PEER_ORIGINS.has(origin.kind) && e.agentId === undefined ? senderOf(e.text) : undefined
    if (sender) await recordContact($, sender, 'in', e.text)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const name = (e as unknown as { name?: string }).name
    if (name) {
      await update($, subagentNames, list => [...new Set([...list, name])].slice(-MAX_SUBAGENT_NAMES)).catch(() => undefined)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    const ran = await next(e)
    if (succeeded(ran)) await recordOutbound($, String(e.to), (e as unknown as { message?: unknown }).message)
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: SEND_TO_SESSION }, async ($, e, next) => {
    const input = e as unknown as { session_id: string; message: string }
    const ran = await next(e)
    if (succeeded(ran)) await recordOutbound($, input.session_id, input.message)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return (await renderBand($, e)) ?? next(e)
  }).catch(($, e, next) => next(e))
}
