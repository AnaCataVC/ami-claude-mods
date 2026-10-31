import type { ContextGuardConfig } from '../types'
import { findMatchingProfile } from './context'

const SEGMENT_SEPARATOR = /&&|\|\||;|\|/
const ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]|^\//

const KUBECTL_OFFLINE = new Set(['config', 'version', 'help', 'completion', 'plugin'])
const KUBECTL_VALUE_FLAGS = new Set(['-n', '--namespace', '--kubeconfig', '-s', '--server'])

const tokenize = (segment: string): string[] =>
  [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(match => match[1] ?? match[2] ?? match[3] ?? '')

const isKubectl = (program: string | undefined): boolean => /^kubectl(\.exe)?$/i.test(program ?? '')

function kubectlSubcommand(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (KUBECTL_VALUE_FLAGS.has(arg)) i++
    else if (!arg.startsWith('-')) return arg
  }
  return undefined
}

function hasExplicitContext(args: string[]): boolean {
  return args.some(arg => arg === '--context' || arg.startsWith('--context='))
}

function isBareKubectl(tokens: string[]): boolean {
  const args = tokens.slice(1)
  if (hasExplicitContext(args) || args.includes('--help') || args.includes('-h')) return false
  const sub = kubectlSubcommand(args)
  return sub === undefined ? false : !KUBECTL_OFFLINE.has(sub)
}

type GitCall = { dir: string; sub: string | undefined; args: string[] }

function parseGit(tokens: string[], dir: string): GitCall {
  let at = 1
  let target = dir
  while (at < tokens.length && tokens[at]!.startsWith('-')) {
    const flag = tokens[at]!
    const value = tokens[at + 1]
    if (flag === '-C' && value !== undefined && ABSOLUTE_PATH.test(value)) target = value
    at += flag === '-C' || flag === '-c' ? 2 : 1
  }
  return { dir: target, sub: tokens[at], args: tokens.slice(at + 1) }
}

const hasFlag = (args: string[], ...flags: string[]): boolean => args.some(arg => flags.includes(arg))

function createsBranch(args: string[]): boolean {
  if (hasFlag(args, '-d', '-D', '-m', '-M', '-u', '--delete', '--list', '--show-current', '-a', '-r', '-v')) return false
  return args.some(arg => !arg.startsWith('-'))
}

function forbiddenGit({ sub, args }: GitCall): string | undefined {
  if (sub === 'commit') return 'commits'
  if (sub === 'checkout' && hasFlag(args, '-b', '-B')) return 'branches'
  if (sub === 'switch' && hasFlag(args, '-c', '-C', '--create')) return 'branches'
  if (sub === 'branch' && createsBranch(args)) return 'branches'
  if (sub === 'worktree' && args[0] === 'add') return 'worktrees'
  return undefined
}

export function denyCommand(command: string, cwd: string, config?: ContextGuardConfig): string | undefined {
  const requireExplicitKube = config?.requireExplicitKubeContext ?? true
  let dir = cwd

  for (const segment of command.split(SEGMENT_SEPARATOR)) {
    const tokens = tokenize(segment.trim())
    const [program, first] = tokens
    if ((program === 'cd' || program === 'Set-Location') && first !== undefined && ABSOLUTE_PATH.test(first)) {
      dir = first
    } else if (requireExplicitKube && isKubectl(program) && isBareKubectl(tokens)) {
      return 'kubectl without --context: active cluster context is global and may be mutated by concurrent sessions. Specify --context <ctx>.'
    } else if (program === 'git') {
      const call = parseGit(tokens, dir)
      const what = forbiddenGit(call)
      const matched = findMatchingProfile(call.dir, config?.profiles)
      if (what !== undefined && matched?.disallowCommits) {
        return `Profile "${matched.label ?? matched.path}" disallows creating ${what} here. Keep changes uncommitted in the working tree.`
      }
    }
  }
  return undefined
}
