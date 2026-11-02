import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { THRESHOLD, denyMessage, meteredTool, statusText, step } from './meter'

const count = atom({ plugin: 'undelegated-reads', key: 'count' } as const, 0)

// Applies one tool call to the in-memory count and returns whether it hit the threshold.
// `update` retries on a version miss, so only the last run of the step decides.
async function record($: EngineInterface, tool: string): Promise<{ count: number; blocked: boolean }> {
  let outcome = { count: 0, blocked: false }
  await update($, count, current => {
    const stepped = step(current, tool)
    outcome = { count: stepped.count, blocked: stepped.blocked }
    return stepped.count
  })
  return outcome
}

export const register: Register = on => {
  on('tool.call', { tool: /^(Grep|Glob|Read|Agent|Task|Bash|PowerShell)$/ }, async ($, e, next) => {
    // Subagent loops are the delegated work, and a harness-spawned agent exists to explore.
    if (e.agentId !== undefined || (await $.env.get('CAD_AGENT_ID'))) return next(e)

    const metered = meteredTool(e.tool, (e as unknown as { command?: unknown }).command)
    // A shell command that is not a search leaves the count, and the shared status line, alone.
    if (metered === 'Bash' || metered === 'PowerShell') return next(e)

    const { count: current, blocked } = await record($, metered)
    $.ui.status(statusText(current))
    if (blocked) return { deny: denyMessage(THRESHOLD) }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A prompt typed by the person opens a new turn: exploration spread over turns is not a streak.
  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta && e.command === undefined) {
      await update($, count, () => 0)
      $.ui.status(undefined)
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}
