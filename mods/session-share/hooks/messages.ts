import type { SessionShareSnapshot } from './share'

export type Language = 'en' | 'es'

// Only an exact `es` (after trim and lowercase) selects Spanish; anything else is English.
export function langFrom(raw: string | undefined | null): Language {
  return raw?.trim().toLowerCase() === 'es' ? 'es' : 'en'
}

const TEXT = {
  en: {
    both: (five: number, seven: number) => `${five}% 5h·${seven}% 7d`,
    fiveOnly: (five: number) => `${five}% 5h`,
    sevenOnly: (seven: number) => `${seven}% 7d`,
  },
  es: {
    both: (five: number, seven: number) => `${five}% 5h·${seven}% 7d`,
    fiveOnly: (five: number) => `${five}% 5h`,
    sevenOnly: (seven: number) => `${seven}% 7d`,
  },
} as const

const WARN_SHARE = 50
const HIGH_SHARE = 80

function glyphFor(maxShare: number): '✓' | '⚠' | '✕' {
  if (maxShare >= HIGH_SHARE) return '✕'
  if (maxShare >= WARN_SHARE) return '⚠'
  return '✓'
}

/**
 * Formats the status line within the 32-character limit of docs/ui-guidelines.md.
 * Shows what percentage of the currently consumed quota (5h and 7d) was spent in this session.
 */
export function statusLine(snapshot: SessionShareSnapshot, language: Language): string | undefined {
  const { fiveHour, sevenDay } = snapshot
  if (!fiveHour && !sevenDay) return undefined

  const t = TEXT[language]
  if (fiveHour && sevenDay) {
    const glyph = glyphFor(Math.max(fiveHour.sharePercent, sevenDay.sharePercent))
    return `${glyph} ${t.both(fiveHour.sharePercent, sevenDay.sharePercent)}`
  }

  if (fiveHour) {
    const glyph = glyphFor(fiveHour.sharePercent)
    return `${glyph} ${t.fiveOnly(fiveHour.sharePercent)}`
  }

  const seven = sevenDay!
  const glyph = glyphFor(seven.sharePercent)
  return `${glyph} ${t.sevenOnly(seven.sharePercent)}`
}
