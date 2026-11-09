import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import { crossedToast, type Language, langFrom, statusLine } from './messages'
import { computePace, parseWorkdays } from './pace'

const WEEKLY_WINDOW = 'seven_day'
const alertedSlot = atom({ plugin: 'quota-pace', key: 'alertedSlot' } as const, null)

type Settings = { workdays: Set<number>; language: Language }

async function refresh($: EngineInterface, rateLimits: SessionRateLimit[], settings: Settings) {
  const weekly = rateLimits.find(limit => limit.kind === WEEKLY_WINDOW)
  if (!weekly?.resetsAt) {
    $.ui.status(undefined)
    return
  }

  const now = new Date(await $.clock.now())
  const pace = computePace(weekly.percentUsed, now, settings.workdays)
  $.ui.status(statusLine(pace, settings.language))

  if (pace.usedPercent > pace.targetPercent && (await read($, alertedSlot)) !== pace.slotKey) {
    await update($, alertedSlot, () => pace.slotKey)
    $.ui.toast(crossedToast(pace, settings.language))
  }
}

export const register: Register = (on, options) => {
  const settings: Settings = {
    workdays: parseWorkdays(String(options.workdays ?? '')),
    language: 'en',
  }

  on('session.start', async ($, e, next) => {
    // A failing env read must not break the mod: it falls back to English.
    const raw = await Promise.resolve($.env.get('CLAUDE_MODS_LANG')).catch(() => undefined)
    settings.language = langFrom(raw as string | undefined)
    const result = await next(e)
    await refresh($, (await $.session.usage()).rateLimits, settings)
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await refresh($, e.rateLimits, settings)
    return next(e)
  })
}
