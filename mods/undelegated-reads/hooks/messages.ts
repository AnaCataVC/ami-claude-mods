export type Lang = 'en' | 'es'

// Only an exact `es` (after trim and lowercase) selects Spanish; anything else is English.
export function langFrom(raw: string | undefined | null): Lang {
  return raw?.trim().toLowerCase() === 'es' ? 'es' : 'en'
}

const en = {
  status: (count: number, threshold: number) => `⚠ ${count}/${threshold} reads without delegating`,
}

const es: typeof en = {
  status: (count, threshold) => `⚠ ${count}/${threshold} lecturas sin delegar`,
}

export const messages: Record<Lang, typeof en> = { en, es }

export const t = (lang: Lang): typeof en => messages[lang]
