import type { Tracked } from '../types'
import { composeLabel, parseGitStatus, runningTracked } from './checklist'
import type { DockerInfo, GitInfo } from './checklist'

/**
 * `ok`: exit 0. `failed`: the command ran and exited non-zero. `error`: it could not start or
 * timed out, so nothing can be said about what it was asked.
 */
export type RunOutcome = { status: 'ok'; stdout: string } | { status: 'failed' } | { status: 'error' }

export type Runner = (argv: string[], cwd?: string) => Promise<RunOutcome>

/** One serial `git status`; null when `cwd` is not a repository or git cannot answer. */
export async function collectGit(run: Runner, cwd: string): Promise<GitInfo | null> {
  const outcome = await run(['git', 'status', '--porcelain=v1', '--branch'], cwd)
  if (outcome.status !== 'ok') return null
  return parseGitStatus(outcome.stdout)
}

/**
 * Costs no process when nothing was tracked. A query that fails leaves its tracked things in
 * `unverified` instead of reading as gone.
 */
export async function collectDocker(run: Runner, state: Tracked): Promise<DockerInfo | null> {
  const { containers, composes, volumes } = state
  if (containers.length + composes.length + volumes.length === 0) return null
  const ps = await run(['docker', 'ps', '--format', '{{.Names}}\t{{.Image}}'])
  if (ps.status === 'error') return { status: 'unknown' }
  if (ps.status === 'failed') return { status: 'down' }

  const unverified: string[] = []
  let leftoverVolumes: string[] = []
  if (volumes.length > 0) {
    const list = await run(['docker', 'volume', 'ls', '--format', '{{.Name}}'])
    if (list.status === 'ok') {
      const present = new Set(list.stdout.split('\n').map(line => line.trim()))
      leftoverVolumes = volumes.filter(name => present.has(name))
    } else unverified.push(...volumes.map(name => `volume ${name}`))
  }

  const upComposes: string[] = []
  for (const compose of composes) {
    const files = compose.files.flatMap(file => ['-f', file])
    const project = compose.project === undefined ? [] : ['-p', compose.project]
    const program = compose.legacy ? ['docker-compose'] : ['docker', 'compose']
    const ids = await run([...program, ...files, ...project, 'ps', '-q'], compose.dir)
    if (ids.status !== 'ok') unverified.push(`compose project ${composeLabel(compose)}`)
    else if (ids.stdout.trim() !== '') upComposes.push(composeLabel(compose))
  }

  return {
    status: 'up',
    containers: runningTracked(ps.stdout, containers),
    composes: upComposes,
    volumes: leftoverVolumes,
    unverified,
  }
}
