import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register, ToolCallInput } from 'claude-code'

import type { ChecklistSection } from '../types'
import {
  TRACKED_RESOURCE_TOOLS,
  buildSections,
  emptyTracked,
  lingeringItems,
  scratchpadDir,
  summarize,
  trackBackground,
  trackCommand,
  trackFile,
  trackResource,
  trackShellWrites,
  withDefaults,
} from './checklist'
import { collectDocker, collectGit } from './collect'
import type { RunOutcome } from './collect'
import { langFrom, t } from './messages'
import type { Lang } from './messages'

const PANE = 'close-checklist'
const SHORT_TIMEOUT_MS = 8000
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
const FILE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])

const tracked = atom({ plugin: 'close-checklist', key: 'tracked' } as const, emptyTracked())
const sections = atom({ plugin: 'close-checklist', key: 'sections' } as const, null)
const lang = atom({ plugin: 'close-checklist', key: 'lang' } as const, 'en' as Lang)

const runner =
  ($: Engine) =>
  async (argv: string[], cwd?: string): Promise<RunOutcome> => {
    try {
      const result = await $.process.run(argv, { cwd, timeoutMs: SHORT_TIMEOUT_MS })
      return result.exitCode === 0 ? { status: 'ok', stdout: result.stdout as string } : { status: 'failed' }
    } catch {
      return { status: 'error' }
    }
  }

async function countScratchpad($: Engine, cwd: string): Promise<number | null> {
  const [temp, tmpDir] = await Promise.all([$.env.get('TEMP'), $.env.get('TMPDIR')])
  const tempDir = (temp ?? tmpDir ?? '/tmp') as string
  try {
    const entries = await $.fs.list(scratchpadDir(tempDir, cwd, await $.session.id()))
    return entries.length
  } catch {
    return null
  }
}

// A failing env read must not break the mod: it falls back to English.
async function loadLang($: Engine): Promise<void> {
  let raw: string | undefined
  try {
    raw = (await $.env.get('CLAUDE_MODS_LANG')) as string | undefined
  } catch {
    // Falls back to English
  }
  await update($, lang, () => langFrom(raw))
}

async function collectSections($: Engine): Promise<ChecklistSection[]> {
  const current = await read($, lang)
  const cwd = (await $.session.cwd()) as string
  const state = await read($, tracked)
  const run = runner($)
  const existing: string[] = []
  for (const file of state.files) if (await $.fs.exists(file)) existing.push(file)
  return buildSections(
    {
      git: await collectGit(run, cwd),
      docker: await collectDocker(run, state, current),
      scratchFiles: await countScratchpad($, cwd),
      files: existing,
      lingering: lingeringItems(withDefaults(state), current),
    },
    current,
  )
}

async function refresh($: Engine): Promise<void> {
  const fresh = await collectSections($).catch(() => null)
  await update($, sections, () => fresh)
}

async function ignoredRoots($: Engine): Promise<string[]> {
  const roots: string[] = []
  const [temp, tmpDir, userProfile, home] = await Promise.all([
    $.env.get('TEMP'),
    $.env.get('TMPDIR'),
    $.env.get('USERPROFILE'),
    $.env.get('HOME'),
  ])
  const tempDir = (temp ?? tmpDir ?? '/tmp') as string
  roots.push(tempDir)
  const homeDir = (userProfile ?? home) as string | undefined
  if (homeDir !== undefined) roots.push(`${homeDir}/.claude`)
  return roots
}

async function trackToolCall($: Engine, e: ToolCallInput): Promise<void> {
  const cwd = (await $.session.cwd()) as string
  const input = e as unknown as Record<string, unknown>
  if (FILE_TOOLS.has(e.tool)) {
    const roots = await ignoredRoots($)
    const path = String(input.file_path ?? input.notebook_path ?? '')
    await update($, tracked, state => trackFile(withDefaults(state), path, cwd, roots))
  } else if (SHELL_TOOLS.has(e.tool)) {
    const roots = await ignoredRoots($)
    const command = String(input.command ?? '')
    await update($, tracked, state => {
      const next = trackShellWrites(trackCommand(withDefaults(state), command, cwd), command, cwd, roots)
      return input.run_in_background === true ? trackBackground(next, command) : next
    })
  } else {
    await update($, tracked, state => trackResource(withDefaults(state), e.tool))
  }
}

async function openPane($: Engine) {
  await refresh($)
  const text = t(await read($, lang))
  await $.ui.open({ id: PANE, title: text.paneTitle, focus: true })
  return { text: text.paneOpened }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadLang($)
    await $.command.register({ name: 'closing-checklist', description: t(await read($, lang)).commandDescription })
    return next(e)
  })

  on('command.run', { command: 'closing-checklist' }, async $ => openPane($))

  for (const tool of [...SHELL_TOOLS, ...FILE_TOOLS, ...TRACKED_RESOURCE_TOOLS]) {
    on('tool.call', { tool }, async ($, e, next) => {
      const result = await next(e)
      if (result.deny === undefined && !result.isError) {
        try {
          await trackToolCall($, e)
        } catch {
          // Tracking is best effort
        }
      }
      return result
    }).catch(($, e, next) => next(e))
  }

  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear') {
      try {
        const line = summarize(await collectSections($), await read($, lang))
        if (line !== undefined) $.ui.toast(line)
      } catch {
        // Session ending
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, sections)
    const text = t(await read($, lang))
    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={2}>
          <Button label={text.refresh} hotkey="r" plain autoFocus onPress={() => refresh($)} />
          {list === null ? null : (
            <Text dimColor>
              {text.pendingCount(list.reduce((pending, section) => pending + section.items.filter(item => !item.ok).length, 0))}
            </Text>
          )}
        </Box>
        {list === null ? (
          <Text dimColor>{text.noData}</Text>
        ) : (
          list.map(section => {
            const pending = section.items.filter(item => !item.ok).length
            return (
              <Box
                key={section.title}
                flexDirection="column"
                borderStyle="round"
                borderColor={pending === 0 ? 'success' : 'warning'}
                borderDimColor={pending === 0}
                paddingX={1}
              >
                <Box gap={1}>
                  <Text weight="bold">{section.title}</Text>
                  <Text color={pending === 0 ? 'success' : 'warning'}>{pending === 0 ? text.upToDate : text.toReview(pending)}</Text>
                </Box>
                {section.items.map((item, index) => (
                  <Text key={`${index}:${item.text}`} color={item.ok ? 'success' : 'warning'} wrap="truncate-end">
                    {item.ok ? '✓' : '⚠'} <Text color="text">{item.text}</Text>
                  </Text>
                ))}
              </Box>
            )
          })
        )}
      </Box>
    )
  })
}
