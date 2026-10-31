import type { ContextGuardConfig, Profile, Snapshot } from '../types'

const GH_HOST = 'github.com'

const REFRESH_TRIGGERS = [
  /(^|[\s;&|(])gh(\.exe)?\s/,
  /\bgit\b[^;&|\n]*\s(push|fetch|pull|clone)\b/,
  /\bkubectl(\.exe)?\s+config\b/,
  /\bget-credentials\b/,
]

export const MIN_GAP_MS = 30_000

export type Warning = { level: 'error' | 'warn'; text: string }

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
  return /(^|[^a-z])prod(uction)?([^a-z]|$)/i.test(context)
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

export function statusText(snapshot: Snapshot, cwd: string, config?: ContextGuardConfig): string {
  const parts: string[] = []
  const matched = findMatchingProfile(cwd, config?.profiles)

  if (snapshot.gh) {
    const isMismatch = isAccountMismatch(snapshot.gh, cwd, config?.profiles)
    const label = accountLabel(snapshot.gh, matched)
    parts.push(`GitHub: ${label}${isMismatch ? ' ✗ mismatch' : matched ? ' ✓' : ''}`)
  } else {
    parts.push('GitHub: no account')
  }

  if (snapshot.kube) {
    const label = kubeLabel(snapshot.kube)
    const isProd = isProdContext(snapshot.kube)
    parts.push(`kubectl: ${label}${isProd ? ' ⚠ prod' : ''}`)
  }

  if (matched?.disallowCommits) {
    parts.push('no direct commits configured')
  }

  return parts.join(' · ')
}

export function warnings(snapshot: Snapshot, cwd: string, config?: ContextGuardConfig): Warning[] {
  const list: Warning[] = []
  const matched = findMatchingProfile(cwd, config?.profiles)

  if (snapshot.gh && matched && snapshot.gh.toLowerCase() !== matched.expectedGhUser.toLowerCase()) {
    list.push({
      level: 'error',
      text: `GitHub account mismatch: active "${snapshot.gh}" does not match profile "${matched.expectedGhUser}" for ${matched.path}`,
    })
  }

  if (snapshot.kube && (config?.warnProductionKube ?? true) && isProdContext(snapshot.kube)) {
    list.push({
      level: 'warn',
      text: `Active Kubernetes context is PRODUCTION: ${snapshot.kube}`,
    })
  }

  return list
}
