import type { ContextGuardConfig, Profile, Snapshot } from '../types'
import { t } from './messages'
import type { Lang } from './messages'

const GH_HOST = 'github.com'

const REFRESH_TRIGGERS = [
  /(^|[\s;&|(])gh(\.exe)?\s/,
  /\bgit\b[^;&|\n]*\s(push|fetch|pull|clone)\b/,
  /\bkubectl(\.exe)?\s+config\b/,
  /\bget-credentials\b/,
]

export const MIN_GAP_MS = 30_000

export function normalize(path: string): string {
  return path.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
}

export function isUnder(path: string, root: string): boolean {
  const candidate = normalize(path)
  const base = normalize(root)
  return candidate === base || candidate.startsWith(`${base}/`)
}

export function findMatchingProfile(cwd: string, profiles: Profile[] = []): Profile | null {
  for (const profile of profiles) {
    if (isUnder(cwd, profile.path)) return profile
  }
  return null
}

export function isProdContext(context: string): boolean {
  return /(^|[^a-z])(prod(uction)?|live)([^a-z]|$)/i.test(context)
}

function unquote(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2')
}

export function parseGhAccount(hostsYml: string): string | null {
  const lines = hostsYml.split(/\r?\n/)
  const start = lines.findIndex(line => line.trimEnd() === `${GH_HOST}:`)
  if (start === -1) return null
  let childIndent: number | null = null
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue
    const indent = line.length - line.trimStart().length
    if (indent === 0) break
    childIndent ??= indent
    if (indent !== childIndent) continue
    const login = /^user:\s*(.*)$/.exec(line.trim())?.[1]
    if (login !== undefined) return unquote(login) || null
  }
  return null
}

export function parseKubeContext(kubeConfig: string): string | null {
  const context = /^current-context:[ \t]*(.*)$/m.exec(kubeConfig)?.[1]
  return context === undefined ? null : unquote(context) || null
}

export function isContextCommand(command: string): boolean {
  return REFRESH_TRIGGERS.some(trigger => trigger.test(command))
}

export function isAccountMismatch(gh: string | null, cwd: string, profiles: Profile[] = []): boolean {
  const matched = findMatchingProfile(cwd, profiles)
  if (!matched || !gh) return false
  return gh.toLowerCase() !== matched.expectedGhUser.toLowerCase()
}

export function accountLabel(login: string, matchedProfile: Profile | null): string {
  if (matchedProfile && login.toLowerCase() === matchedProfile.expectedGhUser.toLowerCase()) {
    return matchedProfile.label ?? login
  }
  return login
}

export function kubeLabel(context: string): string {
  const gke = /^gke_([^_]+)_[^_]+_(.+)$/.exec(context)
  if (gke === null) return context
  const [, project, cluster] = gke
  return project === cluster ? cluster : `${cluster} (${project})`
}

const STATUS_MAX_LENGTH = 32
const STATUS_SEPARATOR = ' · '
const STATUS_MAX_PARTS = 2

interface StatusPart {
  text: string
  // Lower ranks survive when the line has to be shortened: alerts first.
  rank: number
  order: number
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

// Fits the status row: at most two parts, least important dropped first, last resort truncation.
export function statusText(snapshot: Snapshot, cwd: string, config?: ContextGuardConfig, lang: Lang = 'en'): string {
  const text = t(lang)
  const candidates: StatusPart[] = []
  const matched = findMatchingProfile(cwd, config?.profiles)

  if (snapshot.gh) {
    const label = accountLabel(snapshot.gh, matched)
    if (isAccountMismatch(snapshot.gh, cwd, config?.profiles)) {
      candidates.push({ text: `✕ ${label}`, rank: 0, order: 0 })
    } else {
      candidates.push({ text: matched ? `✓ ${label}` : label, rank: 2, order: 0 })
    }
  } else {
    candidates.push({ text: text.noAccount, rank: 2, order: 0 })
  }

  if (snapshot.kube) {
    const label = kubeLabel(snapshot.kube)
    const isProd = (config?.warnProductionKube ?? true) && isProdContext(snapshot.kube)
    candidates.push({ text: isProd ? `⚠ ${label}` : label, rank: isProd ? 1 : 4, order: 1 })
  }

  if (matched?.disallowCommits) {
    candidates.push({ text: text.noDirectCommits, rank: 3, order: 2 })
  }

  const kept = [...candidates].sort((a, b) => a.rank - b.rank).slice(0, STATUS_MAX_PARTS)
  const render = (): string => [...kept].sort((a, b) => a.order - b.order).map(part => part.text).join(STATUS_SEPARATOR)
  while (kept.length > 1 && render().length > STATUS_MAX_LENGTH) kept.pop()
  return truncate(render(), STATUS_MAX_LENGTH)
}
