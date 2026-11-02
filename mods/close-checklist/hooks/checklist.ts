import type { ChecklistItem, ChecklistSection, ComposeProject, Tracked } from '../types'

export const emptyTracked = (): Tracked => ({
  containers: [],
  composes: [],
  volumes: [],
  files: [],
  background: [],
  isWorktreeOpen: false,
  schedules: 0,
})

// State stored by an earlier version lacks newer fields; reading through this fills them in.
export const withDefaults = (state: Partial<Tracked>): Tracked => ({ ...emptyTracked(), ...state })

const normalize = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '')

const isUnder = (path: string, root: string): boolean => {
  const a = normalize(path).toLowerCase()
  const b = normalize(root).toLowerCase()
  return a === b || a.startsWith(`${b}/`)
}

// Splits on shell quotes so `--name "my db"` stays one token.
const tokenize = (segment: string): string[] =>
  [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '')

// Value of `--flag value` or `--flag=value`, the short form included when given.
const flagValues = (tokens: string[], long: string, short?: string): string[] => {
  const values: string[] = []
  tokens.forEach((token, i) => {
    if (token === long || token === short) {
      const next = tokens[i + 1]
      if (next !== undefined) values.push(next)
    } else if (token.startsWith(`${long}=`)) values.push(token.slice(long.length + 1))
  })
  return values
}

const addUnique = <T>(list: T[], item: T, same: (a: T, b: T) => boolean): T[] =>
  list.some(one => same(one, item)) ? list : [...list, item]

// Flags of `docker run` that consume the next token; the image is the first positional that is not one.
const VALUE_FLAGS = new Set([
  '--name', '-p', '--publish', '-v', '--volume', '-e', '--env', '--env-file', '--network', '-w', '--workdir',
  '--restart', '--entrypoint', '-u', '--user', '-l', '--label', '--mount', '-m', '--memory', '-h', '--hostname',
])

const trackRun = (tracked: Tracked, tokens: string[]): Tracked => {
  const isDetached = tokens.includes('-d') || tokens.includes('--detach')
  if (tokens.includes('--rm') && !isDetached) return tracked
  const [name] = flagValues(tokens, '--name')
  let image: string | undefined
  for (let i = 2; i < tokens.length && image === undefined; i++) {
    const token = tokens[i]!
    if (VALUE_FLAGS.has(token)) i++
    else if (!token.startsWith('-')) image = token
  }
  return { ...tracked, containers: addUnique(tracked.containers, { name, image }, (a, b) => (a.name ?? a.image) === (b.name ?? b.image)) }
}

const trackCompose = (tracked: Tracked, tokens: string[], legacy: boolean, cwd: string): Tracked => {
  const rest = tokens.slice(legacy ? 1 : 2)
  const subcommandAt = rest.findIndex(t => t === 'up')
  if (subcommandAt < 0) return tracked
  const head = rest.slice(0, subcommandAt)
  const [project] = flagValues(head, '--project-name', '-p')
  const [projectDir] = flagValues(head, '--project-directory')
  const compose: ComposeProject = {
    legacy,
    files: flagValues(head, '--file', '-f'),
    project,
    dir: projectDir ?? cwd,
  }
  return {
    ...tracked,
    composes: addUnique(tracked.composes, compose, (a, b) => a.dir === b.dir && a.project === b.project && a.files.join() === b.files.join()),
  }
}

const trackSegment = (tracked: Tracked, tokens: string[], cwd: string): Tracked => {
  const [program, sub] = tokens
  if (program === 'docker-compose') return trackCompose(tracked, tokens, true, cwd)
  if (program !== 'docker') return tracked
  if (sub === 'compose') return trackCompose(tracked, tokens, false, cwd)
  if (sub === 'run') return trackRun(tracked, tokens)
  if (sub === 'volume' && tokens[2] === 'create') {
    const name = tokens.slice(3).find(t => !t.startsWith('-'))
    return name === undefined ? tracked : { ...tracked, volumes: addUnique(tracked.volumes, name, (a, b) => a === b) }
  }
  return tracked
}

/** Records the docker resources a Bash/PowerShell command leaves behind. */
export const trackCommand = (tracked: Tracked, command: string, cwd: string): Tracked => {
  let dir = cwd
  let next = tracked
  for (const segment of command.split(/&&|\|\||;|\|/)) {
    const tokens = tokenize(segment.trim())
    if (tokens[0] === 'cd' && tokens[1] !== undefined) dir = tokens[1]
    else next = trackSegment(next, tokens, dir)
  }
  return next
}

/** Records a file Claude wrote, unless it lives in the project or in a session/scratch folder. */
export const trackFile = (tracked: Tracked, path: string, cwd: string, ignoredRoots: string[]): Tracked => {
  if (isUnder(path, cwd) || ignoredRoots.some(root => isUnder(path, root))) return tracked
  return { ...tracked, files: addUnique(tracked.files, normalize(path), (a, b) => a.toLowerCase() === b.toLowerCase()) }
}

const REDIRECT_TARGET = /(?:^|[^\d&>])>>?\s*("[^"]+"|'[^']+'|[^\s;|&>]+)/g
const WRITER_CMDLET = /\b(?:Out-File|Set-Content|Add-Content|tee)\b\s+(?:-(?:FilePath|Path|LiteralPath)\s+)?("[^"]+"|'[^']+'|[^\s;|&>-][^\s;|&>]*)/gi
const NULL_DEVICES = new Set(['/dev/null', 'nul', '$null'])
const IS_ABSOLUTE = /^[a-zA-Z]:[\\/]|^\//

const unquoteToken = (token: string): string => token.replace(/^["']|["']$/g, '')

/** Absolute paths a shell command writes to; relative ones land in the project and are skipped. */
export const shellWriteTargets = (command: string): string[] =>
  [...command.matchAll(REDIRECT_TARGET), ...command.matchAll(WRITER_CMDLET)]
    .map(match => unquoteToken(match[1] ?? ''))
    .filter(path => IS_ABSOLUTE.test(path) && !NULL_DEVICES.has(path.toLowerCase()))

export const trackShellWrites = (tracked: Tracked, command: string, cwd: string, ignoredRoots: string[]): Tracked =>
  shellWriteTargets(command).reduce((state, path) => trackFile(state, path, cwd, ignoredRoots), tracked)

const BACKGROUND_PREVIEW_CHARS = 60

export const trackBackground = (tracked: Tracked, command: string): Tracked => {
  const flat = command.replace(/\s+/g, ' ').trim()
  const preview = flat.length > BACKGROUND_PREVIEW_CHARS ? `${flat.slice(0, BACKGROUND_PREVIEW_CHARS - 1)}…` : flat
  return { ...tracked, background: addUnique(tracked.background, preview, (a, b) => a === b) }
}

const WORKTREE_TOOLS: Record<string, boolean> = { EnterWorktree: true, ExitWorktree: false }
const SCHEDULE_CREATE = new Set(['CronCreate', 'mcp__scheduled-tasks__create_scheduled_task'])
const SCHEDULE_DELETE = new Set(['CronDelete', 'mcp__scheduled-tasks__delete_scheduled_task'])

/** Worktree and schedule bookkeeping for the tools that open or close them. */
export const trackResource = (tracked: Tracked, tool: string): Tracked => {
  if (tool in WORKTREE_TOOLS) return { ...tracked, isWorktreeOpen: WORKTREE_TOOLS[tool]! }
  if (SCHEDULE_CREATE.has(tool)) return { ...tracked, schedules: tracked.schedules + 1 }
  if (SCHEDULE_DELETE.has(tool)) return { ...tracked, schedules: Math.max(0, tracked.schedules - 1) }
  return tracked
}

export const TRACKED_RESOURCE_TOOLS = [...Object.keys(WORKTREE_TOOLS), ...SCHEDULE_CREATE, ...SCHEDULE_DELETE]

export type GitStatus = { branch: string; changes: number; unpushed: number | null }

/**
 * Parses `git status --porcelain=v1 --branch`: the `## branch...upstream [ahead N]` header gives the
 * branch and the unpublished commits, the remaining lines are the changed paths. `unpushed` is null
 * when the branch has no live upstream to compare against.
 */
export const parseGitStatus = (output: string): GitStatus => {
  const lines = output.split('\n').map(line => line.trimEnd())
  const header = lines.find(line => line.startsWith('## ')) ?? ''
  const changes = lines.filter(line => line.trim() !== '' && !line.startsWith('## ')).length
  const text = header.slice(3)
  const unborn = /^(?:No commits yet on|Initial commit on) (.+)$/.exec(text)
  if (unborn) return { branch: unborn[1]!, changes, unpushed: null }
  if (text.startsWith('HEAD (no branch)')) return { branch: 'detached HEAD', changes, unpushed: null }
  const [branch = '', tracking] = text.split('...')
  if (tracking === undefined || tracking.includes('[gone]')) return { branch, changes, unpushed: null }
  const ahead = /\[ahead (\d+)/.exec(tracking)
  return { branch, changes, unpushed: ahead ? Number(ahead[1]) : 0 }
}

export const composeLabel = (compose: ComposeProject): string => compose.project ?? (compose.files.join(', ') || compose.dir)

/** `docker ps --format "{{.Names}}\t{{.Image}}"` rows that match something tracked. */
export const runningTracked = (psOutput: string, tracked: Tracked['containers']): string[] => {
  const rows = psOutput.split('\n').filter(line => line.trim() !== '').map(line => line.split('\t'))
  return rows
    .filter(([name, image]) => tracked.some(one => (one.name !== undefined ? one.name === name : one.image === image)))
    .map(([name]) => name ?? '')
}

/** Things the session opened that no query can confirm closed: the person decides. */
export const lingeringItems = (tracked: Tracked): string[] => [
  ...tracked.background.map(command => `Proceso en segundo plano: ${command} (puede seguir corriendo)`),
  ...(tracked.isWorktreeOpen ? ['Worktree sin cerrar: ejecuta ExitWorktree antes de cerrar'] : []),
  ...(tracked.schedules > 0 ? [`${tracked.schedules} tarea(s) programada(s) activa(s) creada(s) en esta sesión`] : []),
]

export const scratchpadDir = (temp: string, cwd: string, sessionId: string): string =>
  `${normalize(temp)}/claude/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${sessionId}/scratchpad`

export type GitInfo = { branch: string; changes: number; unpushed: number | null }

export type DockerInfo =
  | { status: 'down' }
  | { status: 'unknown' }
  | { status: 'up'; containers: string[]; composes: string[]; volumes: string[]; unverified: string[] }

export type ChecklistInput = {
  git: GitInfo | null
  docker: DockerInfo | null
  scratchFiles: number | null
  files: string[]
  lingering?: string[]
}

const ok = (text: string): ChecklistItem => ({ ok: true, text })
const warn = (text: string): ChecklistItem => ({ ok: false, text })

const gitItems = (git: GitInfo): ChecklistItem[] => {
  const changes =
    git.changes === 0
      ? ok('Sin cambios sin commitear')
      : warn(`${git.changes} cambio${git.changes === 1 ? '' : 's'} sin commitear`)
  const unpushed =
    git.unpushed === null
      ? ok('La rama no tiene upstream')
      : git.unpushed === 0
        ? ok('Sin commits sin pushear')
        : warn(`${git.unpushed} commit${git.unpushed === 1 ? '' : 's'} sin pushear`)
  return [ok(`Rama: ${git.branch}`), changes, unpushed]
}

const dockerItems = (docker: DockerInfo): ChecklistItem[] => {
  if (docker.status === 'down') return [ok('Docker no está corriendo')]
  if (docker.status === 'unknown') return [warn('No se pudo consultar Docker (tiempo agotado o inaccesible)')]
  const left = [
    ...docker.containers.map(name => `el contenedor ${name} sigue corriendo`),
    ...docker.composes.map(name => `el proyecto compose ${name} sigue arriba`),
    ...docker.volumes.map(name => `el volumen ${name} todavía existe`),
    ...docker.unverified.map(what => `No se pudo verificar ${what}`),
  ]
  return left.length === 0 ? [ok('Todos los contenedores/servicios iniciados en esta sesión están detenidos')] : left.map(warn)
}

export const buildSections = (input: ChecklistInput): ChecklistSection[] => {
  const sections: ChecklistSection[] = []
  if (input.git) sections.push({ title: 'Estado de Git', items: gitItems(input.git) })
  if (input.docker) sections.push({ title: 'Docker', items: dockerItems(input.docker) })
  if (input.scratchFiles !== null) {
    sections.push({
      title: 'Scratchpad',
      items: [input.scratchFiles === 0 ? ok('Scratchpad vacío') : warn(`${input.scratchFiles} archivo(s) en el scratchpad`)],
    })
  }
  if (input.lingering?.length) sections.push({ title: 'Tareas y recursos pendientes', items: input.lingering.map(warn) })
  sections.push({
    title: 'Archivos creados fuera del proyecto',
    items: input.files.length === 0 ? [ok('Ninguno')] : input.files.map(warn),
  })
  return sections
}

/** One-line summary for session termination; undefined when everything is clean. */
export const summarize = (sections: ChecklistSection[]): string | undefined => {
  const pending = sections.flatMap(section => section.items).filter(item => !item.ok).length
  if (pending === 0) return undefined
  return `Antes de cerrar: ${pending} ítem${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'}, revisa /cierre`
}
