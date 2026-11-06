import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { denyReason, toastText } from './guard'
import { langFrom } from './messages'
import type { Lang } from './messages'

const TOAST_GAP_MS = 20_000

let lastToastAt = 0

const lang = atom({ plugin: 'cleanroom-guard', key: 'lang' } as const, 'en' as Lang)

// A failing env read must not break the mod: it falls back to English.
async function loadLang($: EngineInterface): Promise<void> {
  let raw: string | undefined
  try {
    raw = (await $.env.get('CLAUDE_MODS_LANG')) as string | undefined
  } catch {
    // Falls back to English
  }
  await update($, lang, () => langFrom(raw))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadLang($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: /^(Read|Grep|Glob|Edit|Write|NotebookEdit|Bash|PowerShell)$/ }, async ($, e, next) => {
    // Only subagent loops carry agentId; the main session is never restricted.
    if (e.agentId === undefined) return next(e)
    const agent = (await $.agent.list()).find(a => a.id === e.agentId)
    const call = { tool: e.tool, input: e as unknown as Record<string, unknown> }
    const reason = denyReason(agent?.type, call)
    if (reason === undefined) return next(e)

    const now = await $.clock.now()
    if (now - lastToastAt >= TOAST_GAP_MS) {
      lastToastAt = now
      $.ui.toast(toastText(agent?.type, call, await read($, lang))!)
    }
    return { deny: reason }
  }).catch(($, e, next) => next(e))
}
