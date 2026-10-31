import type { HookRow, ModRow } from '../types'

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

// Shows the script name instead of the whole command line when available:
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
  return (value ?? '')
    .split(';')
    .map(dir => dir.trim())
    .filter(Boolean)
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
export function reportText(hooks: HookRow[], mods: ModRow[]): string {
  const lines = [`Hooks (${hooks.length})`]
  for (const event of [...new Set(hooks.map(row => row.event))]) {
    lines.push(`  ${event}`)
    for (const row of hooks.filter(one => one.event === event)) {
      const timeout = row.timeout ? ` (${row.timeout}s)` : ''
      lines.push(`    [${row.matcher}] ${shortCommand(row.command)}${timeout}  ${row.source}`)
    }
  }
  lines.push('', `Mods (${mods.length})`)
  for (const mod of mods) lines.push(`  ${mod.name} v${mod.version}${mod.description ? ` - ${mod.description}` : ''}`)
  return lines.join('\n')
}
