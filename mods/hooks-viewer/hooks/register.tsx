import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SettingsSource } from 'claude-code'

import type { ModRow } from '../types'
import { limitRows, modDirs, parseMod, reportText, shortCommand, toRows } from './rows'

const PANE = 'hooks-viewer'
const TITLE = 'Hooks & Mods'
const CHROME_ROWS = 10
const SOURCES: SettingsSource[] = ['user', 'project', 'local', 'flag', 'policy']

const rows = atom({ plugin: 'hooks-viewer', key: 'rows' } as const, [], { shape: 'rows-1' })
const mods = atom({ plugin: 'hooks-viewer', key: 'mods' } as const, [], { shape: 'mods-1' })

async function readSource($: EngineInterface, source: SettingsSource) {
  try {
    return toRows((await $.settings.read({ source })).hooks, source)
  } catch {
    return []
  }
}

async function readMod($: EngineInterface, dir: string): Promise<ModRow | undefined> {
  const manifest = await $.fs.read(`${dir.replace(/\\/g, '/')}/.claude-plugin/plugin.json`).catch(() => '')
  return parseMod(manifest)
}

async function readMods($: EngineInterface): Promise<ModRow[]> {
  const dirs = modDirs(await $.env.get('CLAUDE_CODE_PLUGIN_DIRS'))
  const found = await Promise.all(dirs.map(dir => readMod($, dir)))
  return found.filter((mod): mod is ModRow => mod !== undefined)
}

async function reload($: EngineInterface) {
  try {
    const [perSource, loaded] = await Promise.all([
      Promise.all(SOURCES.map(source => readSource($, source))),
      readMods($),
    ])
    await update($, rows, () => perSource.flat())
    await update($, mods, () => loaded)
  } catch {
    // Keep the previous rows
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hooks-panel',
      description: 'Show settings hooks and loaded mods with their origins',
    })
    await reload($)
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'hooks-panel' }, async $ => {
    await reload($)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: reportText((await read($, rows)) ?? [], (await read($, mods)) ?? []) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = (await read($, rows)) ?? []
    const loaded = (await read($, mods)) ?? []
    const maxRows = e.viewport?.rows === undefined ? list.length : e.viewport.rows - CHROME_ROWS - loaded.length
    const { shown, hidden } = limitRows(list, maxRows)
    const events = [...new Set(shown.map(row => row.event))]

    return (
      <Box flexDirection="column">
        <Button label="↻ refresh" onPress={() => reload($)} />
        <Text bold>Settings Hooks ({list.length})</Text>
        {list.length === 0 ? <Text dimColor>No hooks configured.</Text> : null}
        {events.map(event => (
          <Box key={event} flexDirection="column">
            <Text bold>{event}</Text>
            {shown
              .filter(row => row.event === event)
              .map((row, index) => (
                <Text key={`${row.source}:${row.matcher}:${index}`} wrap="truncate-end">
                  {'  '}[{row.matcher}] {shortCommand(row.command)}
                  {row.timeout ? ` (${row.timeout}s)` : ''} <Text dimColor>{row.source}</Text>
                </Text>
              ))}
          </Box>
        ))}
        {hidden > 0 ? <Text dimColor>… and {hidden} more</Text> : null}
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Loaded Mods ({loaded.length})</Text>
          {loaded.length === 0 ? <Text dimColor>No mods found in CLAUDE_CODE_PLUGIN_DIRS.</Text> : null}
          {loaded.map(mod => (
            <Text key={mod.name} wrap="truncate-end">
              {'  '}
              {mod.name} <Text dimColor>v{mod.version}</Text>
            </Text>
          ))}
        </Box>
      </Box>
    )
  })
}
