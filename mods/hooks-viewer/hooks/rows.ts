import type { HookRow, ModRow } from '../types'
import { t } from './messages'
import type { Lang } from './messages'

type HookEntry = { type?: string; command?: string; args?: string[]; timeout?: number }
type HookGroup = { matcher?: string; hooks?: HookEntry[] }

const SCRIPT_EXTENSION = /\.(ps1|sh|js|py)$/i
const FILE_FLAG_VALUE = /(?:^|\s)-File\s+("[^"]+"|'[^']+'|\S+)/i
const TOKEN = /"([^"]+)"|'([^']+)'|(\S+)/g

// Flattens one source's settings.hooks ({ Event: [{ matcher, hooks: [...] }] }) into one row per hook.
export function toRows(hooks: unknown, source: string): HookRow[] {
  if (!hooks || typeof hooks !== 'object') return []
  const rows: HookRow[] = []
  for (const [event, groups] of Object.entries(hooks as Record<string, HookGroup[]>)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
        rows.push({
          event,
          source,
          matcher: group.matcher || '*',
          command: commandLine(hook),
          timeout: hook.timeout,
        })
      }
    }
  }
  return rows
}

// Exec-form hooks keep the script in `args`, so the line to inspect is `command` plus `args`.
function commandLine(hook: HookEntry): string {
  if (hook.command === undefined) return `(${hook.type ?? 'hook'})`
  return Array.isArray(hook.args) ? [hook.command, ...hook.args].join(' ') : hook.command
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function unquote(token: string): string {
  return token.replace(/^["']|["']$/g, '')
}

// Shows the script name instead of the whole `pwsh -NoProfile -File "..." args` line:
// the `-File` value wins, then the first token that looks like a script path.
// Anything else (inline commands, URLs) is shown untouched.
export function shortCommand(command: string): string {
  const fileFlag = command.match(FILE_FLAG_VALUE)
  if (fileFlag) return baseName(unquote(fileFlag[1]))
  for (const match of command.matchAll(TOKEN)) {
    const token = match[1] ?? match[2] ?? match[3]
    if (SCRIPT_EXTENSION.test(token)) return baseName(token)
  }
  return command
}

// Splits the rows into the part that fits the pane and how many were left out.
export function limitRows(rows: HookRow[], maxRows: number): { shown: HookRow[]; hidden: number } {
  const shown = rows.slice(0, Math.max(1, maxRows))
  return { shown, hidden: rows.length - shown.length }
}

// CLAUDE_CODE_PLUGIN_DIRS holds the mod folders separated by `;`.
export function modDirs(value: string | undefined): string[] {
  return (value ?? '').split(';').map(dir => dir.trim()).filter(Boolean)
}

// A manifest that is not JSON or names no plugin is not a mod row.
export function parseMod(manifest: string): ModRow | undefined {
  try {
    const parsed = JSON.parse(manifest) as { name?: unknown; version?: unknown; description?: unknown }
    if (typeof parsed.name !== 'string') return undefined
    return {
      name: parsed.name,
      version: typeof parsed.version === 'string' ? parsed.version : '?',
      description: typeof parsed.description === 'string' ? parsed.description : '',
    }
  } catch {
    return undefined
  }
}

// The same listing as the pane, as plain text for the command's reply, which shows on every surface.
export function reportText(hooks: HookRow[], mods: ModRow[], lang: Lang = 'en'): string {
  const text = t(lang)
  const lines = [text.settingsHooks(hooks.length)]
  for (const event of [...new Set(hooks.map(row => row.event))]) {
    lines.push(`  ${event}`)
    for (const row of hooks.filter(one => one.event === event)) {
      const timeout = row.timeout ? ` (${row.timeout}s)` : ''
      lines.push(`    [${row.matcher}] ${shortCommand(row.command)}${timeout}  ${sourceLabel(row.source, lang)}`)
    }
  }
  lines.push('', text.modsLoaded(mods.length))
  for (const mod of mods) lines.push(`  ${mod.name} v${mod.version}${mod.description ? ` - ${mod.description}` : ''}`)
  return lines.join('\n')
}

// Lifecycle order: the sequence a session goes through, so the pane reads top to bottom like it runs.
const EVENT_ORDER = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop', 'PreCompact', 'SessionEnd']
// Events whose hooks can veto the action, worth spotting at a glance.
const BLOCKING_EVENTS = new Set(['PreToolUse', 'UserPromptSubmit'])
const MAX_CHIPS = 3

export function sortEvents(events: string[]): string[] {
  const rank = (event: string) => (EVENT_ORDER.includes(event) ? EVENT_ORDER.indexOf(event) : EVENT_ORDER.length)
  return [...events].sort((a, b) => rank(a) - rank(b))
}

export function canBlock(event: string): boolean {
  return BLOCKING_EVENTS.has(event)
}

// A matcher as short chips: `*` reads as the localized "all", MCP regexes lose their boilerplate,
// and anything beyond MAX_CHIPS collapses into a "+N" chip.
export function matcherChips(matcher: string, lang: Lang = 'en'): string[] {
  if (matcher === '*') return [t(lang).allChip]
  const readable = matcher.startsWith('mcp__') ? [matcher.replace(/^mcp__(\.\*)?_*/, 'mcp:').replace(/\(([^)]*)\)\?/g, '[$1]')] : matcher.split('|')
  if (readable.length <= MAX_CHIPS) return readable
  return [...readable.slice(0, MAX_CHIPS), `+${readable.length - MAX_CHIPS}`]
}

// Known settings layers read in the active language; an unknown one shows as it came.
export function sourceLabel(source: string, lang: Lang = 'en'): string {
  return t(lang).sources[source] ?? source
}

export function summaryText(hooks: HookRow[], mods: ModRow[], lang: Lang = 'en'): string {
  const text = t(lang)
  const bySource = new Map<string, number>()
  for (const row of hooks) bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1)
  const sources = [...bySource].map(([source, count]) => `${count} ${sourceLabel(source, lang)}`)
  return [text.hooksCount(hooks.length), ...sources, text.modsCount(mods.length)].join(' · ')
}
