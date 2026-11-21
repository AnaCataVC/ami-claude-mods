import type { ContextGuardConfig } from '../types'
import { findMatchingProfile } from './context'

const ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]|^\//

const KUBECTL_OFFLINE = new Set(['config', 'version', 'help', 'completion', 'plugin'])
const KUBECTL_VALUE_FLAGS = new Set(['-n', '--namespace', '--kubeconfig', '-s', '--server'])

const tokenize = (segment: string): string[] =>
  [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(match => match[1] ?? match[2] ?? match[3] ?? '')

const CMD_WRAPPER = /^\s*(?:&\s*)?(?:"[^"]*"|'[^']*'|\S+)\s+\/c\s+([\s\S]*)$/i

// Drops a leading call operator and directory prefix so `& "C:\Git\git.exe"` compares as `git.exe`.
function normalizeProgram(tokens: string[]): string[] {
  const rest = tokens[0] === '&' ? tokens.slice(1) : tokens
  if (rest.length === 0) return rest
  return [rest[0]!.replace(/^.*[\\/]/, '').toLowerCase(), ...rest.slice(1)]
}

const isProgram = (program: string | undefined, name: string): boolean =>
  program === name || program === `${name}.exe`

const isKubectl = (program: string | undefined): boolean => isProgram(program, 'kubectl')

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

const COMMIT_CREATING = new Set(['merge', 'cherry-pick', 'revert', 'rebase', 'am'])

function createsCommits({ sub, args }: GitCall): boolean {
  if (sub === undefined || !COMMIT_CREATING.has(sub)) return false
  if (hasFlag(args, '--abort', '--quit', '--skip')) return false
  return !(sub === 'merge' && hasFlag(args, '--ff-only'))
}

function forbiddenGit(call: GitCall): string | undefined {
  const { sub, args } = call
  if (sub === 'commit' || createsCommits(call)) return 'commits'
  if (sub === 'checkout' && hasFlag(args, '-b', '-B')) return 'branches'
  if (sub === 'switch' && hasFlag(args, '-c', '-C', '--create')) return 'branches'
  if (sub === 'branch' && createsBranch(args)) return 'branches'
  if (sub === 'worktree' && args[0] === 'add') return 'worktrees'
  return undefined
}

const unquote = (text: string): string => text.trim().replace(/^["']/, '').replace(/["']$/, '')

function splitSegments(command: string): string[] {
  const segments: string[] = []
  let quote: '"' | "'" | null = null
  let start = 0

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!
    if (quote !== null) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    const two = command.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      segments.push(command.slice(start, i))
      i++
      start = i + 1
    } else if (ch === ';' || ch === '|') {
      segments.push(command.slice(start, i))
      start = i + 1
    }
  }
  segments.push(command.slice(start))
  return segments
}

function evaluate(command: string, startDir: string, config?: ContextGuardConfig): string | undefined {
  const requireExplicitKube = config?.requireExplicitKubeContext ?? true
  let dir = startDir

  for (const segment of splitSegments(command)) {
    const raw = segment.trim()
    const tokens = normalizeProgram(tokenize(raw))
    const program = tokens[0]
    const first = tokens[1]
    if (isProgram(program, 'cmd') && first?.toLowerCase() === '/c') {
      const wrapped = CMD_WRAPPER.exec(raw)
      const reason = wrapped ? evaluate(unquote(wrapped[1]!), dir, config) : undefined
      if (reason !== undefined) return reason
    } else if ((program === 'cd' || program === 'set-location') && first !== undefined && ABSOLUTE_PATH.test(first)) {
      dir = first
    } else if (requireExplicitKube && isKubectl(program) && isBareKubectl(tokens)) {
      return 'kubectl without --context: active cluster context is global and may be mutated by concurrent sessions. Specify --context <ctx>.'
    } else if (isProgram(program, 'git')) {
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

export function denyCommand(command: string, cwd: string, config?: ContextGuardConfig): string | undefined {
  return evaluate(command, cwd, config)
}
