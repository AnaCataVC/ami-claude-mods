import type { PlanStatus } from '../types'

export type Lang = 'en' | 'es'

// Only an exact `es` (after trim and lowercase) selects Spanish; anything else is English.
export function langFrom(raw: string | undefined | null): Lang {
  return raw?.trim().toLowerCase() === 'es' ? 'es' : 'en'
}

// The status words are the plan file's parsed vocabulary (always Spanish); these maps only
// change how they are displayed.
const statusEn: Record<PlanStatus, string> = {
  pendiente: 'pending',
  listo: 'ready',
  'en curso': 'in progress',
  bloqueado: 'blocked',
  hecho: 'done',
}
const statusEs: Record<PlanStatus, string> = {
  pendiente: 'pendiente',
  listo: 'listo',
  'en curso': 'en curso',
  bloqueado: 'bloqueado',
  hecho: 'hecho',
}
const pluralEn: Record<PlanStatus, string> = {
  pendiente: 'pending',
  listo: 'ready',
  'en curso': 'in progress',
  bloqueado: 'blocked',
  hecho: 'done',
}
const pluralEs: Record<PlanStatus, string> = {
  pendiente: 'pendientes',
  listo: 'listos',
  'en curso': 'en curso',
  bloqueado: 'bloqueados',
  hecho: 'hechos',
}

const en = {
  status: statusEn,
  statusPlural: pluralEn,
  // Violation texts quote the column headers and keywords the user must write in the file.
  noTable: 'No table with Id and Estado columns — ask "arma la tabla del plan"',
  outsideVocabulary: (id: string) => `${id}: Estado outside the vocabulary`,
  justNow: 'just now',
  minutesAgo: (minutes: number) => `${minutes} min ago`,
  hoursAgo: (hours: number) => `${hours} h ago`,
  daysAgo: (days: number) => `${days} d ago`,
  driftMerged: 'PR merged',
  driftNoSession: 'no live session',
  driftIdle: (ago: string) => `session idle ${ago}`,
  driftWorking: 'has a session working',
  unblocked: (done: string, labels: string) => `${done} done → now unblocked: ${labels}`,
  summary: (done: number, total: number, blocked: number) =>
    `plan ${done}/${total}${blocked ? ` · ${blocked} ${pluralEn.bloqueado}` : ''}`,
  instructionCopied: 'Instruction copied: paste it into the prompt',
  launching: (label: string) => `Launching ${label}…`,
  launchingMany: (count: number) => `Launching ${count} ${pluralEn.listo}…`,
  syncing: (label: string) => `Syncing ${label}…`,
  paneTitle: 'Plan progress',
  commandDescription: 'Opens the plan progress pane',
  argumentHint: '[plan path]',
  fileMissing: (given: string) => `Could not read ${given}: the file does not exist; check that the path has no trailing punctuation.`,
  unreadable: (given: string, reason: string) => `Could not read ${given}: ${reason}`,
  noPlan: 'No plan.md in this folder or the ones above.',
  paneOpened: 'Plan pane opened.',
  waits: 'waits on',
  unblocksLabels: (labels: string) => `↳ unblocks ${labels}`,
  hidePrompt: '▾ hide prompt',
  showPrompt: '▸ show prompt',
  launchRequested: (ago: string) => `launch requested ${ago}`,
  confirmLaunch: (label: string) => `launch ${label}? `,
  yes: 'yes',
  no: 'no',
  launch: '▶ launch',
  copyPrompt: 'copy prompt',
  edited: (ago: string) => `edited ${ago}`,
  nextItem: (label: string) => ` · next: ${label}`,
  launchAll: (count: number) => `▶ launch the ${count} ${pluralEn.listo}`,
  driftsHeader: (count: number) => `⚠ DRIFTS (${count})`,
  sync: 'sync',
  violationsHeader: (count: number) => `⚠ OUTSIDE THE CONTRACT (${count})`,
}

const es: typeof en = {
  status: statusEs,
  statusPlural: pluralEs,
  noTable: 'Sin tabla con columnas Id y Estado — pide "arma la tabla del plan"',
  outsideVocabulary: id => `${id}: estado fuera del vocabulario`,
  justNow: 'recién',
  minutesAgo: minutes => `hace ${minutes} min`,
  hoursAgo: hours => `hace ${hours} h`,
  daysAgo: days => `hace ${days} d`,
  driftMerged: 'PR mergeado',
  driftNoSession: 'sin sesión viva',
  driftIdle: ago => `sesión libre ${ago}`,
  driftWorking: 'tiene una sesión trabajando',
  unblocked: (done, labels) => `${done} hecho → quedan sin bloqueo: ${labels}`,
  summary: (done, total, blocked) => `plan ${done}/${total}${blocked ? ` · ${blocked} ${pluralEs.bloqueado}` : ''}`,
  instructionCopied: 'Instrucción copiada: pégala en el prompt',
  launching: label => `Lanzando ${label}…`,
  launchingMany: count => `Lanzando ${count} ${pluralEs.listo}…`,
  syncing: label => `Sincronizando ${label}…`,
  paneTitle: 'Avance del plan',
  commandDescription: 'Abre el panel de avance del plan',
  argumentHint: '[ruta del plan]',
  fileMissing: given => `No se pudo leer ${given}: el archivo no existe; revisa que la ruta no tenga puntuación al final.`,
  unreadable: (given, reason) => `No se pudo leer ${given}: ${reason}`,
  noPlan: 'No hay plan.md en esta carpeta ni en las de arriba.',
  paneOpened: 'Panel del plan abierto.',
  waits: 'espera',
  unblocksLabels: labels => `↳ desbloquea ${labels}`,
  hidePrompt: '▾ ocultar prompt',
  showPrompt: '▸ ver prompt',
  launchRequested: ago => `lanzamiento pedido ${ago}`,
  confirmLaunch: label => `¿lanzar ${label}? `,
  yes: 'sí',
  no: 'no',
  launch: '▶ lanzar',
  copyPrompt: 'copiar prompt',
  edited: ago => `editado ${ago}`,
  nextItem: label => ` · siguiente: ${label}`,
  launchAll: count => `▶ lanzar los ${count} ${pluralEs.listo}`,
  driftsHeader: count => `⚠ DESFASES (${count})`,
  sync: 'sincronizar',
  violationsHeader: count => `⚠ FUERA DEL CONTRATO (${count})`,
}

export const messages: Record<Lang, typeof en> = { en, es }

export const t = (lang: Lang): typeof en => messages[lang]
