import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SettingsSource } from 'claude-code'

import type { ModRow } from '../types'
import { langFrom, t } from './messages'
import type { Lang } from './messages'
import { canBlock, limitRows, matcherChips, modDirs, parseMod, reportText, shortCommand, sortEvents, sourceLabel, summaryText, toRows } from './rows'

const PANE = 'hooks-viewer'
// Rows the pane keeps for its button, caption and section headers.
const CHROME_ROWS = 8
// Each hook draws its script line and its matcher chips line.
const ROWS_PER_HOOK = 2
const SOURCES: SettingsSource[] = ['user', 'project', 'local', 'flag', 'policy']
// Change a tag when the row fields change: it declines what an earlier version stored.
const rows = atom({ plugin: 'hooks-viewer', key: 'rows' } as const, [], { shape: 'rows-1' })
const mods = atom({ plugin: 'hooks-viewer', key: 'mods' } as const, [], { shape: 'mods-1' })
const lang = atom({ plugin: 'hooks-viewer', key: 'lang' } as const, 'en' as Lang)

// A failing env read must not break the mod: it falls back to English.
async function loadLang($: EngineInterface): Promise<void> {
  let raw: string | undefined
  try {
    raw = (await $.env.get('CLAUDE_MODS_LANG')) as string | undefined
  } catch {
    // Falls back to English
  }
  await update($, lang, () => langFrom(raw))
}

async function readSource($: EngineInterface, source: SettingsSource) {
  try {
    const result = await $.settings.read({ source })
    const settings = result && typeof result === 'object' && 'value' in result
      ? (result.value as { hooks?: unknown })
      : (result as { hooks?: unknown })
    return toRows(settings?.hooks, source)
  } catch {
    return []
  }
}

// Every folder in CLAUDE_CODE_PLUGIN_DIRS is expected to hold a plugin.json file.
async function readMod($: EngineInterface, dir: string): Promise<ModRow | undefined> {
  try {
    const path = `${dir.replace(/\\/g, '/')}/.claude-plugin/plugin.json`
    const manifest = await $.fs.read(path)
    if (typeof manifest !== 'string') return undefined
    return parseMod(manifest)
  } catch {
    return undefined
  }
}

async function readMods($: EngineInterface): Promise<ModRow[]> {
  const dirs = modDirs(await $.env.get('CLAUDE_CODE_PLUGIN_DIRS'))
  const found = await Promise.all(dirs.map(dir => readMod($, dir)))
  return found.filter((mod): mod is ModRow => mod !== undefined)
}

// A failed reload keeps what is already shown instead of blanking the pane.
async function reload($: EngineInterface) {
  try {
    const [perSource, loaded] = await Promise.all([Promise.all(SOURCES.map(source => readSource($, source))), readMods($)])
    await update($, rows, () => perSource.flat())
    await update($, mods, () => loaded)
  } catch {
    // Keep the previous rows.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadLang($)
    await $.command.register({ name: 'hooks-panel', description: t(await read($, lang)).commandDescription })
    await reload($)
    return next(e)
  })

  // The reply carries the listing as text too, so it shows even where no surface draws the pane.
  on('command.run', { command: 'hooks-panel' }, async $ => {
    await reload($)
    const current = await read($, lang)
    await $.ui.open({ id: PANE, title: t(current).title, focus: true })
    const list = (await read($, rows)) ?? []
    const loaded = (await read($, mods)) ?? []
    return { text: reportText(list, loaded, current) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await read($, lang)
    const text = t(current)
    const list = (await read($, rows)) ?? []
    const loaded = (await read($, mods)) ?? []
    const maxRows = e.viewport?.rows === undefined ? list.length : Math.floor((e.viewport.rows - CHROME_ROWS - Math.ceil(loaded.length / 2)) / ROWS_PER_HOOK)
    const { shown, hidden } = limitRows(list, maxRows)
    const events = sortEvents([...new Set(shown.map(row => row.event))])

    return (
      <Box flexDirection="column">
        <Box gap={2}>
          <Button label={text.refresh} hotkey="r" autoFocus plain onPress={() => reload($)} />
          <Text dimColor wrap="truncate-end">{summaryText(list, loaded, current)}</Text>
        </Box>
        {list.length === 0 ? <Text dimColor>{text.noHooks}</Text> : null}
        {events.map(event => {
          const eventRows = shown.filter(row => row.event === event)
          return (
            <Box
              key={event}
              flexDirection="column"
              marginTop={1}
              borderStyle="round"
              borderColor={canBlock(event) ? 'warning' : 'subtle'}
              borderDimColor
              paddingX={1}
            >
              <Box gap={1}>
                <Text weight="bold" color="claude">{event}</Text>
                <Text dimColor>{eventRows.length}</Text>
                {canBlock(event) ? <Text color="warning">{text.canBlock}</Text> : null}
              </Box>
              {eventRows.map((row, index) => (
                <Box key={`${row.source}:${row.matcher}:${index}`} flexDirection="column" paddingLeft={1}>
                  <Box gap={1}>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text weight="bold" wrap="truncate-end">{shortCommand(row.command)}</Text>
                    </Box>
                    <Text dimColor>{row.timeout ? `${row.timeout}s` : ''}</Text>
                    <Box width={9} justifyContent="flex-end">
                      <Text color={row.source === 'user' ? 'inactive' : 'permission'}>{sourceLabel(row.source, current)}</Text>
                    </Box>
                  </Box>
                  <Box gap={1} flexWrap="wrap" paddingLeft={2}>
                    {matcherChips(row.matcher, current).map(chip => (
                      <Text key={chip} color="suggestion" dimColor={row.matcher === '*' || chip.startsWith('+')} wrap="truncate-end">{chip}</Text>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          )
        })}
        {hidden > 0 ? <Text dimColor>{text.andMore(hidden)}</Text> : null}
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="success" borderDimColor paddingX={1}>
          <Text weight="bold" color="success">{text.modsLoaded(loaded.length)}</Text>
          <Box flexWrap="wrap" columnGap={2}>
            {loaded.map(mod => (
              <Text key={mod.name} wrap="truncate-end">
                <Text color="success">✓</Text> {mod.name} <Text dimColor>v{mod.version}</Text>
              </Text>
            ))}
          </Box>
        </Box>
      </Box>
    )
  })
}
