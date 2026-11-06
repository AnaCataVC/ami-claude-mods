import { t } from './messages'
import type { Lang } from './messages'

// Delegation meter rules: the count of consecutive mechanical read calls in the main
// session, the block at THRESHOLD and the count from which the status is shown.
export const THRESHOLD = 10
export const WARN_FROM = THRESHOLD - 3

export type Step = { count: number; blocked: boolean }

const COUNTED_TOOLS = new Set(['Grep', 'Glob', 'Read'])
const RESET_TOOLS = new Set(['Agent', 'Task'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
// Searching through the shell is the same mechanical exploration as Grep/Glob; a plain cat of
// one file is a read the person asked for and is not counted.
const SHELL_SEARCH = /\b(grep|rg|find|Select-String|findstr)\b|\b(Get-ChildItem|gci|ls|dir)\b[^;|&\n]*(-Recurse|-r\b|-R\b|\/s\b)/i

// The tool name the meter sees: a searching shell command counts as a Grep.
export function meteredTool(tool: string, command: unknown): string {
  return SHELL_TOOLS.has(tool) && typeof command === 'string' && SHELL_SEARCH.test(command) ? 'Grep' : tool
}

// Delegating resets, read-type tools add one, and reaching THRESHOLD blocks that call and
// resets. Any other tool leaves the count alone.
export function step(count: number, tool: string): Step {
  if (RESET_TOOLS.has(tool)) return { count: 0, blocked: false }
  if (!COUNTED_TOOLS.has(tool)) return { count, blocked: false }
  const next = count + 1
  return next >= THRESHOLD ? { count: 0, blocked: true } : { count: next, blocked: false }
}

export function denyMessage(count: number): string {
  return `${count} consecutive mechanical reads without delegating: dispatch to an exploration subagent or proceed (counter resets).`
}

// Below WARN_FROM there is nothing to warn about, so the status is cleared. The count resets
// at the blocked call, so the highest visible count is THRESHOLD - 1.
export function statusText(count: number, lang: Lang = 'en'): string | undefined {
  if (count < WARN_FROM) return undefined
  return t(lang).status(count, THRESHOLD)
}
