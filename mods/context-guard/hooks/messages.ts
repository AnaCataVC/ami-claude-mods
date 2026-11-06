export type Lang = 'en' | 'es'

// Only an exact `es` (after trim and lowercase) selects Spanish; anything else is English.
export function langFrom(raw: string | undefined | null): Lang {
  return raw?.trim().toLowerCase() === 'es' ? 'es' : 'en'
}

const en = {
  noAccount: 'No GitHub account',
  noDirectCommits: 'no direct commits',
}

const es: typeof en = {
  noAccount: 'Sin cuenta GitHub',
  noDirectCommits: 'sin commits directos',
}

export const messages: Record<Lang, typeof en> = { en, es }

export const t = (lang: Lang): typeof en => messages[lang]
