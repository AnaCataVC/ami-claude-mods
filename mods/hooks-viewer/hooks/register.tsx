import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SettingsSource } from 'claude-code'

import type { ModRow } from '../types'
import { canBlock, limitRows, matcherChips, modDirs, parseMod, reportText, shortCommand, sortEvents, summaryText, toRows } from './rows'

const PANE = 'hooks-viewer'
const TITLE = 'Hooks y mods'
// Rows the pane keeps for its button, caption and section headers.
const CHROME_ROWS = 8
// Each hook draws its script line and its matcher chips line.
const ROWS_PER_HOOK = 2
const SOURCES: SettingsSource[] = ['user', 'project', 'local', 'flag', 'policy']
// Change a tag when the row fields change: it declines what an earlier version stored.
const rows = atom({ plugin: 'hooks-viewer', key: 'rows' } as const, [], { shape: 'rows-1' })
const mods = atom({ plugin: 'hooks-viewer', key: 'mods' } as const, [], { shape: 'mods-1' })

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
    await $.command.register({ name: 'hooks-panel', description: 'Muestra los hooks de settings y los mods cargados' })
    await reload($)
    return next(e)
  })

  // The reply carries the listing as text too, so it shows even where no surface draws the pane.
  on('command.run', { command: 'hooks-panel' }, async $ => {
    await reload($)
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    const list = (await read($, rows)) ?? []
    const loaded = (await read($, mods)) ?? []
    return { text: reportText(list, loaded) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = (await read($, rows)) ?? []
    const loaded = (await read($, mods)) ?? []
    const maxRows = e.viewport?.rows === undefined ? list.length : Math.floor((e.viewport.rows - CHROME_ROWS - Math.ceil(loaded.length / 2)) / ROWS_PER_HOOK)
    const { shown, hidden } = limitRows(list, maxRows)
    const events = sortEvents([...new Set(shown.map(row => row.event))])

    return (
      <Box flexDirection="column">
        <Box gap={2}>
          <Button label="↻ actualizar" hotkey="r" autoFocus plain onPress={() => reload($)} />
          <Text dimColor wrap="truncate-end">{summaryText(list, loaded)}</Text>
        </Box>
        {list.length === 0 ? <Text dimColor>No hay hooks configurados.</Text> : null}
        {events.map(event => {
          const eventRows = shown.filter(row => row.event === event)
          return (
            <Box key={event} flexDirection="column" marginTop={1}>
              <Box gap={1}>
                <Text bold>{event}</Text>
                <Text dimColor>{eventRows.length}</Text>
                {canBlock(event) ? <Text color="warning">puede bloquear</Text> : null}
              </Box>
              {eventRows.map((row, index) => (
                <Box key={`${row.source}:${row.matcher}:${index}`} flexDirection="column" paddingLeft={2}>
                  <Box gap={1}>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text bold wrap="truncate-end">{shortCommand(row.command)}</Text>
                    </Box>
                    <Text dimColor>{row.timeout ? `${row.timeout}s` : ''}</Text>
                    <Box width={7} justifyContent="flex-end">
                      <Text color={row.source === 'user' ? 'inactive' : 'permission'}>{row.source}</Text>
                    </Box>
                  </Box>
                  <Box gap={1} flexWrap="wrap" paddingLeft={2}>
                    {matcherChips(row.matcher).map(chip => (
                      <Text key={chip} color="suggestion" dimColor={chip === 'todos' || chip.startsWith('+')} wrap="truncate-end">{chip}</Text>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          )
        })}
        {hidden > 0 ? <Text dimColor>… y {hidden} más</Text> : null}
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Mods cargados ({loaded.length})</Text>
          <Box flexWrap="wrap" columnGap={2} paddingLeft={2}>
            {loaded.map(mod => (
              <Text key={mod.name} wrap="truncate-end">
                {mod.name} <Text dimColor>v{mod.version}</Text>
              </Text>
            ))}
          </Box>
        </Box>
      </Box>
    )
  })
}
