export type Lang = 'en' | 'es'

// Only an exact `es` (after trim and lowercase) selects Spanish; anything else is English.
export function langFrom(raw: string | undefined | null): Lang {
  return raw?.trim().toLowerCase() === 'es' ? 'es' : 'en'
}

const en = {
  justNow: 'just now',
  minutesAgo: (minutes: number) => `${minutes}m ago`,
  hoursAgo: (hours: number) => `${hours}h ago`,
  keyboardHint: '1-3 in the empty prompt replies · ctrl+x tab: v view, d dismiss, tab to move',
  replyCopied: 'Reply instruction copied to the clipboard: paste it into the prompt',
  reply: 'reply',
  hide: 'hide',
  view: 'view',
  dismiss: 'dismiss',
  more: (extra: number) => `+${extra} more`,
}

const es: typeof en = {
  justNow: 'recién',
  minutesAgo: minutes => `hace ${minutes}m`,
  hoursAgo: hours => `hace ${hours}h`,
  keyboardHint: '1-3 en el prompt vacío responde · ctrl+x tab: v ver, d descartar, tab para moverte',
  replyCopied: 'Instrucción de respuesta copiada al portapapeles: pégala en el prompt',
  reply: 'responder',
  hide: 'ocultar',
  view: 'ver',
  dismiss: 'descartar',
  more: extra => `+${extra} más`,
}

export const messages: Record<Lang, typeof en> = { en, es }

export const t = (lang: Lang): typeof en => messages[lang]
