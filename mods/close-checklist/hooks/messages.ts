export type Lang = 'en' | 'es'

// Only an exact `es` (after trim and lowercase) selects Spanish; anything else is English.
export function langFrom(raw: string | undefined | null): Lang {
  return raw?.trim().toLowerCase() === 'es' ? 'es' : 'en'
}

const plural = (count: number, singular: string, many: string): string => (count === 1 ? singular : many)

const en = {
  backgroundProcess: (command: string) => `Background process: ${command} (may still be running)`,
  worktreeOpen: 'Worktree not closed: run ExitWorktree before closing',
  schedules: (count: number) => `${count} active scheduled task(s) created in this session`,
  noUncommitted: 'No uncommitted changes',
  uncommitted: (count: number) => `${count} uncommitted ${plural(count, 'change', 'changes')}`,
  noUpstream: 'The branch has no upstream',
  noUnpushed: 'No unpushed commits',
  unpushed: (count: number) => `${count} unpushed ${plural(count, 'commit', 'commits')}`,
  branch: (name: string) => `Branch: ${name}`,
  detachedHead: 'detached HEAD',
  dockerDown: 'Docker is not running',
  dockerUnknown: 'Could not query Docker (timed out or unreachable)',
  containerRunning: (name: string) => `container ${name} is still running`,
  composeUp: (name: string) => `compose project ${name} is still up`,
  volumeExists: (name: string) => `volume ${name} still exists`,
  unverified: (what: string) => `Could not verify ${what}`,
  allStopped: 'All containers/services started in this session are stopped',
  unverifiedVolume: (name: string) => `volume ${name}`,
  unverifiedCompose: (label: string) => `compose project ${label}`,
  gitTitle: 'Git status',
  scratchpadEmpty: 'Scratchpad empty',
  scratchpadFiles: (count: number) => `${count} file(s) in the scratchpad`,
  lingeringTitle: 'Pending tasks and resources',
  outsideTitle: 'Files created outside the project',
  none: 'None',
  summary: (pending: number) => `${pending} pending ${plural(pending, 'item', 'items')} · review /closing-checklist`,
  paneTitle: 'Before closing',
  paneOpened: 'Checklist pane opened.',
  commandDescription: 'Review pending items and resources before closing the session',
  refresh: '↻ refresh',
  pendingCount: (count: number) => `${count} pending`,
  noData: 'No data. Press r to refresh.',
  upToDate: 'up to date',
  toReview: (count: number) => `${count} to review`,
}

const es: typeof en = {
  backgroundProcess: command => `Proceso en segundo plano: ${command} (puede seguir corriendo)`,
  worktreeOpen: 'Worktree sin cerrar: ejecuta ExitWorktree antes de cerrar',
  schedules: count => `${count} tarea(s) programada(s) activa(s) creada(s) en esta sesión`,
  noUncommitted: 'Sin cambios sin commitear',
  uncommitted: count => `${count} cambio${plural(count, '', 's')} sin commitear`,
  noUpstream: 'La rama no tiene upstream',
  noUnpushed: 'Sin commits sin pushear',
  unpushed: count => `${count} commit${plural(count, '', 's')} sin pushear`,
  branch: name => `Rama: ${name}`,
  detachedHead: 'HEAD desacoplado',
  dockerDown: 'Docker no está corriendo',
  dockerUnknown: 'No se pudo consultar Docker (tiempo agotado o inaccesible)',
  containerRunning: name => `el contenedor ${name} sigue corriendo`,
  composeUp: name => `el proyecto compose ${name} sigue arriba`,
  volumeExists: name => `el volumen ${name} todavía existe`,
  unverified: what => `No se pudo verificar ${what}`,
  allStopped: 'Todos los contenedores/servicios iniciados en esta sesión están detenidos',
  unverifiedVolume: name => `el volumen ${name}`,
  unverifiedCompose: label => `el proyecto compose ${label}`,
  gitTitle: 'Estado de Git',
  scratchpadEmpty: 'Scratchpad vacío',
  scratchpadFiles: count => `${count} archivo(s) en el scratchpad`,
  lingeringTitle: 'Tareas y recursos pendientes',
  outsideTitle: 'Archivos creados fuera del proyecto',
  none: 'Ninguno',
  summary: pending => `${pending} pendiente${plural(pending, '', 's')} · revisa /closing-checklist`,
  paneTitle: 'Antes de cerrar',
  paneOpened: 'Panel de checklist abierto.',
  commandDescription: 'Revisa los pendientes y recursos antes de cerrar la sesión',
  refresh: '↻ actualizar',
  pendingCount: count => `${count} pendientes`,
  noData: 'Sin datos. Presiona r para actualizar.',
  upToDate: 'al día',
  toReview: count => `${count} por revisar`,
}

export const messages: Record<Lang, typeof en> = { en, es }

export const t = (lang: Lang): typeof en => messages[lang]
