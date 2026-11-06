import type { Pace } from './pace'

export type Language = 'en' | 'es'

// Only an exact `es` (after trim and lowercase) selects Spanish; anything else is English.
export function langFrom(raw: string | undefined | null): Language {
  return raw?.trim().toLowerCase() === 'es' ? 'es' : 'en'
}

const TEXT = {
  en: {
    line: (p: Pace) => `${p.usedPercent}% of ${p.targetPercent}% today`,
    crossed: (p: Pace) => `Daily target passed · ${p.usedPercent}% of your weekly limit used (target ${p.targetPercent}%)`,
  },
  es: {
    line: (p: Pace) => `${p.usedPercent}% de ${p.targetPercent}% hoy`,
    crossed: (p: Pace) => `Meta del día superada · llevas ${p.usedPercent}% de tu límite semanal (meta ${p.targetPercent}%)`,
  },
} as const

const TIGHT_MARGIN = 5

/** Compact on purpose: the status row truncates long text. Glyphs per docs/ui-guidelines.md: ✓ on pace, ⚠ close, ✕ over. */
export function statusLine(pace: Pace, language: Language): string {
  const margin = Math.round((pace.targetPercent - pace.usedPercent) * 10) / 10
  const text = TEXT[language].line(pace)
  if (margin < 0) return `✕ ${text} (+${-margin})`
  return `${margin < TIGHT_MARGIN ? '⚠' : '✓'} ${text}`
}

export function crossedToast(pace: Pace, language: Language): string {
  return TEXT[language].crossed(pace)
}
