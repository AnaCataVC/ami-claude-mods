export type Lang = 'en' | 'es'

// Only an exact `es` (after trim and lowercase) selects Spanish; anything else is English.
export function langFrom(raw: string | undefined | null): Lang {
  return raw?.trim().toLowerCase() === 'es' ? 'es' : 'en'
}

const en = {
  workingTreeDiff: 'working tree diff',
  actionWrite: 'writing',
  actionRead: 'reading',
  blocked: (agentType: string | undefined, action: string, name: string) => `cleanroom: blocked ${agentType} from ${action} ${name}`,
}

const es: typeof en = {
  workingTreeDiff: 'diff del working tree',
  actionWrite: 'escribir',
  actionRead: 'leer',
  blocked: (agentType, action, name) => `cleanroom: bloqueé a ${agentType} ${action} ${name}`,
}

export const messages: Record<Lang, typeof en> = { en, es }

export const t = (lang: Lang): typeof en => messages[lang]
