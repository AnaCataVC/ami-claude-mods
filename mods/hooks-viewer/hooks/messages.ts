export type Lang = 'en' | 'es'

// Only an exact `es` (after trim and lowercase) selects Spanish; anything else is English.
export function langFrom(raw: string | undefined | null): Lang {
  return raw?.trim().toLowerCase() === 'es' ? 'es' : 'en'
}

const en = {
  title: 'Hooks and mods',
  commandDescription: 'Shows the hooks from settings and the loaded mods',
  refresh: '↻ refresh',
  noHooks: 'No hooks configured.',
  canBlock: '⛔ can block',
  andMore: (hidden: number) => `… and ${hidden} more`,
  modsLoaded: (count: number) => `Loaded mods (${count})`,
  settingsHooks: (count: number) => `Settings hooks (${count})`,
  allChip: 'all',
  hooksCount: (count: number) => `${count} hooks`,
  modsCount: (count: number) => `${count} mods`,
  sources: { user: 'user', project: 'project', local: 'local', flag: 'flag', policy: 'policy' } as Record<string, string>,
}

const es: typeof en = {
  title: 'Hooks y mods',
  commandDescription: 'Muestra los hooks de settings y los mods cargados',
  refresh: '↻ actualizar',
  noHooks: 'No hay hooks configurados.',
  canBlock: '⛔ puede bloquear',
  andMore: hidden => `… y ${hidden} más`,
  modsLoaded: count => `Mods cargados (${count})`,
  settingsHooks: count => `Hooks de settings (${count})`,
  allChip: 'todos',
  hooksCount: count => `${count} hooks`,
  modsCount: count => `${count} mods`,
  sources: { user: 'usuario', project: 'proyecto', local: 'local', flag: 'flag', policy: 'política' },
}

export const messages: Record<Lang, typeof en> = { en, es }

export const t = (lang: Lang): typeof en => messages[lang]
