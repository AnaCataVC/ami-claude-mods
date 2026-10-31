import type { Register } from 'claude-code'

import { denyReason } from './guard'

const TOAST_GAP_MS = 20_000

let lastToastAt = 0

export const register: Register = on => {
  on('tool.call', { tool: /^(Read|Grep|Glob|Edit|Write|NotebookEdit|Bash|PowerShell)$/ }, async ($, e, next) => {
    // Only subagent loops carry agentId; the main session is never restricted.
    if (e.agentId === undefined) return next(e)
    const agent = (await $.agent.list()).find(a => a.id === e.agentId)
    const reason = denyReason(agent?.type, { tool: e.tool, input: e as unknown as Record<string, unknown> })
    if (reason === undefined) return next(e)

    const now = await $.clock.now()
    if (now - lastToastAt >= TOAST_GAP_MS) {
      lastToastAt = now
      $.ui.toast(reason)
    }
    return { deny: reason }
  }).catch(($, e, next) => next(e))
}
