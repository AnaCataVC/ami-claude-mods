import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import { type Language, langFrom, statusLine } from './messages'
import {
  applyRateLimits,
  emptyLedger,
  recordTurnComplete,
  recordTurnStart,
  snapshotFromLedger,
} from './share'

const ledgerAtom = atom({ plugin: 'session-share', key: 'ledger' } as const, null)

type Settings = { language: Language }

async function refresh(
  $: EngineInterface,
  rateLimits: readonly SessionRateLimit[],
  settings: Settings,
  isBaseline = false,
) {
  const current = await read($, ledgerAtom)
  const nextLedger = applyRateLimits(current, rateLimits, isBaseline)
  await update($, ledgerAtom, () => nextLedger)
  const snapshot = snapshotFromLedger(nextLedger, rateLimits)
  $.ui.status(statusLine(snapshot, settings.language))
}

export const register: Register = on => {
  const settings: Settings = {
    language: 'en',
  }

  on('session.start', async ($, e, next) => {
    const raw = await Promise.resolve($.env.get('CLAUDE_MODS_LANG')).catch(() => undefined)
    settings.language = langFrom(raw as string | undefined)
    const result = await next(e)
    await refresh($, (await $.session.usage()).rateLimits, settings, true)
    return result
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, ledgerAtom, current => recordTurnStart(current ?? emptyLedger(), e.agentId))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, ledgerAtom, current => recordTurnComplete(current ?? emptyLedger(), e.agentId, e.usage))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await refresh($, e.rateLimits, settings, false)
    } else {
      // Clear per-turn accumulators after main-thread turn measure when rateLimits did not move
      await update($, ledgerAtom, current =>
        current
          ? {
              ...current,
              mainTokensSinceMeasure: 0,
              subagentTokensSinceMeasure: 0,
              isMainTurnActive: false,
            }
          : current,
      )
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      const rateLimits = (await $.session.usage().catch(() => ({ rateLimits: [] }))).rateLimits
      await refresh($, rateLimits, settings, true)
    }
    return next(e)
  })
}
