import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { PlanSnapshot, PlanStatus, WorkItem } from '../types'
import {
  cleanTitle,
  dependsOn,
  hasWorkTable,
  isPlanName,
  isRedundantNote,
  labelOf,
  parsePlan,
  parsePrompts,
  planPathIn,
  prioRank,
  promptFor,
  statusChanges,
  titleFromHeading,
} from './parse'
import { langFrom, t } from './messages'
import type { Lang } from './messages'
import { canLaunch, launchBatchInstruction, launchInstruction, launchable, syncInstruction } from './launch'
import type { LiveSession, SeenStatus } from './reconcile'
import { ago, detectDrifts, newlyUnblocked, nextItem, nextSeen, parseRegistryEntry, unblocks } from './reconcile'

const PANE = 'orchestrate-plan'
const PLAN_FILE = 'plan.md'
const POLL_MS = 15_000
const RECENT_MS = 30 * 60_000
const REGISTRY_TTL_MS = 5_000
const PR_TTL_MS = 5 * 60_000
const GH_TIMEOUT_MS = 20_000
const BAR_WIDTH = 24
const PROMPT_LINES = 14
const plan = atom({ plugin: 'orchestrate-plan', key: 'plan' } as const, null)
const drifts = atom({ plugin: 'orchestrate-plan', key: 'drifts' } as const, [])
const collapsed = atom({ plugin: 'orchestrate-plan', key: 'collapsed' } as const, ['pendiente'])
const openPrompt = atom({ plugin: 'orchestrate-plan', key: 'openPrompt' } as const, null)
const confirmLaunch = atom({ plugin: 'orchestrate-plan', key: 'confirmLaunch' } as const, null)
const confirmBatch = atom({ plugin: 'orchestrate-plan', key: 'confirmBatch' } as const, false)
const launchedAt = atom({ plugin: 'orchestrate-plan', key: 'launchedAt' } as const, {})
const lang = atom({ plugin: 'orchestrate-plan', key: 'lang' } as const, 'en' as Lang)

// What can be launched now first; what waits on others after; the not-yet-prepared last.
const GROUPS: readonly PlanStatus[] = ['listo', 'en curso', 'bloqueado', 'pendiente']
const BAR_ORDER: readonly PlanStatus[] = ['hecho', 'en curso', 'listo', 'bloqueado', 'pendiente']
const COLOR: Record<PlanStatus, string | undefined> = {
  bloqueado: 'error',
  'en curso': 'warning',
  listo: 'suggestion',
  pendiente: undefined,
  hecho: 'success',
}
const MARK: Record<PlanStatus, string> = { bloqueado: '✕', 'en curso': '◐', listo: '○', pendiente: '·', hecho: '✓' }

// The cwd's newest plan-named .md that holds a work table, else the nearest plan.md above it.
const findPlan = async ($: EngineInterface) => {
  const candidates = (await $.fs.list())
    .filter(f => f.kind === 'file' && isPlanName(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  for (const file of candidates) {
    if (hasWorkTable(await $.fs.read(file.name).catch(() => ''))) return file.name
  }
  const found = await $.fs.ancestors({ names: [PLAN_FILE] })
  const nearest = found.at(-1)
  return nearest ? `${nearest.dir}/${PLAN_FILE}` : undefined
}

// undefined when the path is readable; otherwise whether it is simply absent and the raw reason.
const statFailure = async ($: EngineInterface, path: string) => {
  try {
    await $.fs.stat(path)
    return undefined
  } catch (err) {
    const reason = String(err)
    const code = (err as { code?: unknown } | null)?.code
    return { missing: code === 'ENOENT' || /ENOENT|no such file/i.test(reason), reason }
  }
}

// A failing env read must not break the mod: it falls back to English.
const loadLang = async ($: EngineInterface) => {
  let raw: string | undefined
  try {
    raw = (await $.env.get('CLAUDE_MODS_LANG')) as string | undefined
  } catch {
    // Falls back to English
  }
  await update($, lang, () => langFrom(raw))
}

const summary = (snap: PlanSnapshot, language: Lang) => {
  const done = snap.items.filter(i => i.status === 'hecho').length
  const blocked = snap.items.filter(i => i.status === 'bloqueado').length
  return t(language).summary(done, snap.items.length, blocked)
}

// The store outlives sessions, so a block's age counts from the first session that saw it.
const persistSeen = async ($: EngineInterface, path: string, items: readonly WorkItem[]) => {
  const key = `seen:${path}`
  const stored = ((await $.store.get(key).catch(() => undefined)) ?? {}) as Record<string, SeenStatus>
  const seen = nextSeen(stored, items, Date.now())
  if (JSON.stringify(seen) !== JSON.stringify(stored)) await $.store.set(key, seen).catch(() => undefined)
  return Object.fromEntries(Object.entries(seen).map(([id, s]) => [id, s.since]))
}

const refresh = async ($: EngineInterface, path: string, force = false) => {
  const stat = await $.fs.stat(path).catch(() => undefined)
  const previous = await read($, plan)
  if (!stat) {
    await update($, plan, () => null)
    $.ui.status(undefined)
    return
  }
  // Polling is a stat; the file is only read and parsed when it changed.
  if (!force && previous?.path === path && previous.mtimeMs === stat.mtimeMs) return
  const text = await $.fs.read(path)
  const current = await read($, lang)
  const parsed = parsePlan(text, current)
  const prompts = parsePrompts(text)
  const promptsById: Record<string, string> = {}
  for (const item of parsed.items) {
    const prompt = promptFor(item, prompts)
    if (!prompt) continue
    promptsById[item.id] = `${prompt.heading}\n\n${prompt.body}`
    item.title ??= titleFromHeading(item, prompt.heading)
  }
  const changedAt = previous?.path === path ? { ...previous.changedAt } : {}
  if (previous?.path === path) {
    const before = new Map(previous.items.map(i => [i.id, i.status]))
    for (const item of parsed.items) {
      if (before.has(item.id) && before.get(item.id) !== item.status) changedAt[item.id] = Date.now()
    }
    const changes = [...statusChanges(previous.items, parsed.items, current), ...newlyUnblocked(previous.items, parsed.items, current)]
    if (changes.length) $.ui.toast(changes.join(' · '))
  }
  const since = await persistSeen($, path, parsed.items)
  const snap: PlanSnapshot = { ...parsed, path, mtimeMs: stat.mtimeMs, prompts: promptsById, changedAt, since }
  await update($, plan, () => snap)
  $.ui.status(summary(snap, current))
}

// Each status gets a share of the bar proportional to its count; rounding leftovers go to the largest.
const barSegments = (items: readonly WorkItem[]) => {
  const total = Math.max(1, items.length)
  const segments = BAR_ORDER.map(status => ({
    status,
    cells: Math.round((items.filter(i => i.status === status).length / total) * BAR_WIDTH),
  }))
  const drift = BAR_WIDTH - segments.reduce((sum, s) => sum + s.cells, 0)
  const largest = segments.reduce((a, b) => (b.cells > a.cells ? b : a))
  largest.cells = Math.max(0, largest.cells + drift)
  return segments
}

let registryCache: { at: number; sessions: LiveSession[] } | undefined

// One JSON file per live Claude Code process, written by the CLI next to this mod's config dir.
const liveSessions = async ($: EngineInterface) => {
  if (registryCache && Date.now() - registryCache.at < REGISTRY_TTL_MS) return registryCache.sessions
  const dir = `${$.plugin.root}/../../sessions`
  const files = (await $.fs.list(dir).catch(() => [])).filter(f => f.kind === 'file' && f.name.endsWith('.json'))
  const texts = await Promise.all(files.map(f => $.fs.read(`${dir}/${f.name}`).catch(() => '')))
  const sessions = texts.map(parseRegistryEntry).filter((s): s is LiveSession => s !== undefined)
  registryCache = { at: Date.now(), sessions }
  return sessions
}

const prStates = new Map<string, { state?: string; checkedAt: number }>()

// gh answers with the account active on the machine; a failure (gh missing, no access) keeps the
// last known state and is retried after the TTL like any other check.
const refreshPrStates = async ($: EngineInterface, urls: readonly string[]) => {
  const due = urls.filter(url => Date.now() - (prStates.get(url)?.checkedAt ?? 0) >= PR_TTL_MS)
  for (const url of due) prStates.set(url, { state: prStates.get(url)?.state, checkedAt: Date.now() })
  // One at a time: this runs in the background and a plan may hold many PRs.
  for (const url of due) {
    const result = await $.process
      .run(['gh', 'pr', 'view', url, '--json', 'state', '-q', '.state'], { timeoutMs: GH_TIMEOUT_MS })
      .catch(() => undefined)
    if (result?.exitCode === 0) prStates.set(url, { state: result.stdout.trim(), checkedAt: Date.now() })
  }
  return due.length > 0
}

const writeDrifts = async ($: EngineInterface) => {
  const snap = await read($, plan)
  const states = Object.fromEntries([...prStates].map(([url, c]) => [url, c.state]))
  const next = snap ? detectDrifts(snap.items, await liveSessions($), states, Date.now(), await read($, lang)) : []
  const current = await read($, drifts)
  if (JSON.stringify(current) !== JSON.stringify(next)) await update($, drifts, () => next)
}

let isReconciling = false

// Drifts are written from what is cached first, then again once the due gh checks came back,
// so a slow gh never holds the pane.
const reconcile = async ($: EngineInterface) => {
  if (isReconciling) return
  isReconciling = true
  try {
    await writeDrifts($)
    const snap = await read($, plan)
    const urls = snap ? snap.items.filter(i => i.status !== 'hecho').flatMap(i => i.prUrls) : []
    if (await refreshPrStates($, [...new Set(urls)])) await writeDrifts($)
  } finally {
    isReconciling = false
  }
}

const headingOf = (snap: PlanSnapshot, id: string) => (snap.prompts[id] ?? '').split('\n')[0] || id

// The orchestrator's model acts with its own tools and permissions; when the text cannot enter
// as a turn, it goes to the clipboard instead.
const submit = async ($: EngineInterface, text: string, surface: RenderSurface, sent: string) => {
  const result = await $.prompt.submit({ text }).catch(() => undefined)
  if (result && !result.drop) {
    $.ui.toast(sent)
    return
  }
  await $.ui.copy({ text, surface })
  $.ui.toast(t(await read($, lang)).instructionCopied)
}

const launch = async ($: EngineInterface, item: WorkItem, snap: PlanSnapshot, surface: RenderSurface) => {
  await update($, confirmLaunch, () => null)
  await update($, launchedAt, all => ({ ...all, [item.id]: Date.now() }))
  await submit($, launchInstruction(item, snap.path, headingOf(snap, item.id)), surface, t(await read($, lang)).launching(labelOf(item)))
}

const launchAll = async ($: EngineInterface, items: readonly WorkItem[], snap: PlanSnapshot, surface: RenderSurface) => {
  const now = Date.now()
  await update($, confirmBatch, () => false)
  await update($, launchedAt, all => ({ ...all, ...Object.fromEntries(items.map(i => [i.id, now])) }))
  const text = launchBatchInstruction(items.map(i => ({ item: i, heading: headingOf(snap, i.id) })), snap.path)
  await submit($, text, surface, t(await read($, lang)).launchingMany(items.length))
}

let tracked: string | undefined

const track = async ($: EngineInterface, path: string, openPane: boolean) => {
  const isNew = tracked !== path
  tracked = path
  await refresh($, path, true)
  void reconcile($).catch(() => undefined)
  if (isNew && openPane) void $.ui.open({ id: PANE, title: t(await read($, lang)).paneTitle })
}

const poll = async ($: EngineInterface) => {
  if (!tracked) return
  await refresh($, tracked)
  await reconcile($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadLang($)
    const result = await next(e)
    const text = t(await read($, lang))
    await $.command.register({ name: 'plan-progress', description: text.commandDescription, argumentHint: text.argumentHint })
    const path = await findPlan($)
    if (path) await track($, path, true)
    $.clock.every(POLL_MS, () => void poll($).catch(() => undefined))
    return result
  })

  on('command.run', { command: 'plan-progress' }, async ($, e) => {
    const text = t(await read($, lang))
    // An explicit path (e.g. a plan written under ~/.claude/plans) overrides the folder search.
    // The desktop app appends a <widget_context_hint> block to the args; only the first line is the path.
    const given = e.args.replace(/<widget_context_hint>[\s\S]*/, '').trim().split(/\r?\n/)[0].trim().replace(/^["']|["']$/g, '')
    let resolved = given
    if (given) {
      const failure = await statFailure($, given)
      if (failure) {
        // Sentence punctuation pasted from prose is tried only after the literal path fails.
        const stripped = given.replace(/[.,;:]+$/, '').replace(/["']$/, '')
        const strippedFailure = stripped !== given && stripped ? await statFailure($, stripped) : failure
        if (strippedFailure === undefined) resolved = stripped
        else if (failure.missing) {
          return { text: text.fileMissing(JSON.stringify(given)) }
        } else return { text: text.unreadable(JSON.stringify(given), failure.reason) }
      }
    }
    const path = resolved || tracked || (await findPlan($))
    if (!path) return { text: text.noPlan }
    await track($, path, false)
    await $.ui.open({ id: PANE, title: text.paneTitle })
    return { text: text.paneOpened }
  })

  // A plan created or edited mid-session starts tracking at once, without waiting for the poll.
  // Only writes count: reading another session's plan-named file must not take over the pane.
  on('tool.call', { tool: /^(Write|Edit|MultiEdit|NotebookEdit)$/ }, async ($, e, next) => {
    const ran = await next(e)
    const touched = planPathIn(e)
    if (touched) {
      // The file the session itself wrote wins over the cwd search, so no path has to be given later.
      const readable = (await statFailure($, touched)) === undefined
      const hasTable = readable && hasWorkTable(await $.fs.read(touched).catch(() => ''))
      const path = hasTable ? touched : await findPlan($).catch(() => undefined)
      if (path) void track($, path, true).catch(() => undefined)
    }
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const snap = await read($, plan)
    const current = await read($, lang)
    const text = t(current)
    if (!snap) return <Text dimColor>{text.noPlan}</Text>
    const folded = await read($, collapsed)
    const shownPrompt = await read($, openPrompt)
    const confirming = await read($, confirmLaunch)
    const confirmingBatch = await read($, confirmBatch)
    const launched = await read($, launchedAt)
    const drifting = await read($, drifts)
    const now = Date.now()

    const count = (s: PlanStatus) => snap.items.filter(i => i.status === s).length
    const done = count('hecho')
    const percent = Math.round((done / Math.max(1, snap.items.length)) * 100)
    const isRecent = (id: string) => now - (snap.changedAt[id] ?? 0) < RECENT_MS
    const next = nextItem(snap.items)
    const labelFor = (id: string) => labelOf(snap.items.find(i => i.id === id) ?? { id })
    const batch = launchable(snap.items, snap.prompts, launched, now)

    const toggleGroup = (status: PlanStatus) =>
      update($, collapsed, list => (list.includes(status) ? list.filter(s => s !== status) : [...list, status]))
    const togglePrompt = (id: string) => update($, openPrompt, current => (current === id ? null : id))

    const itemRow = (item: WorkItem) => {
      const deps = dependsOn(item, snap.items)
      const freed = unblocks(item, snap.items)
      const prompt = snap.prompts[item.id]
      const isPromptOpen = shownPrompt === item.id
      const blockedSince = snap.since[item.id]
      return (
        <Box flexDirection="column">
          <Text wrap="wrap">
            {isRecent(item.id) ? <Text color="warning">● </Text> : null}
            <Text weight="bold">{labelOf(item)}</Text>
          </Text>
          <Text wrap="truncate-end">
            {item.title && <Text dimColor>{item.id}</Text>}
            {item.prio && (
              <Text color="inactive">{item.title ? '  ' : ''}P{prioRank(item.prio) === 9 ? '?' : prioRank(item.prio)}</Text>
            )}
            {item.status === 'bloqueado' && blockedSince !== undefined && (
              <Text color="error">  ⏱ {ago(blockedSince, now, current)}</Text>
            )}
          </Text>
          {(item.status === 'bloqueado' || item.status === 'pendiente') &&
            (deps.length > 0 ? (
              <Text wrap="wrap">
                <Text dimColor>{text.waits} </Text>
                {deps.map(d => (
                  <Text color={d.status ? COLOR[d.status] : 'subtle'}>
                    {labelOf(d)} {d.status ? MARK[d.status] : '·'}{' '}
                  </Text>
                ))}
              </Text>
            ) : (
              item.waitsOn && item.waitsOn !== '—' && <Text dimColor wrap="wrap">{text.waits} {item.waitsOn}</Text>
            ))}
          {item.note && !isRedundantNote(item.note) && (
            <Text color="subtle" wrap="truncate-end">{item.note}</Text>
          )}
          {freed.length > 0 && (
            <Text color="subtle" wrap="truncate-end">{text.unblocksLabels(freed.map(labelOf).join(', '))}</Text>
          )}
          {prompt && item.status === 'listo' && (
            <Box paddingLeft={2} flexDirection="row">
              <Button plain dimColor label={isPromptOpen ? text.hidePrompt : text.showPrompt} onPress={() => togglePrompt(item.id)} />
              <Text>  </Text>
              {!canLaunch(launched[item.id], now) ? (
                <Text dimColor>{text.launchRequested(ago(launched[item.id] ?? now, now, current))}</Text>
              ) : confirming === item.id ? (
                <Box flexDirection="row">
                  <Text color="warning">{text.confirmLaunch(labelOf(item))}</Text>
                  <Button plain label={text.yes} onPress={press => launch($, item, snap, press.surface)} />
                  <Text> / </Text>
                  <Button plain dimColor label={text.no} onPress={() => update($, confirmLaunch, () => null)} />
                </Box>
              ) : (
                <Button plain label={text.launch} onPress={() => update($, confirmLaunch, () => item.id)} />
              )}
            </Box>
          )}
          {prompt && isPromptOpen && (
            <Box flexDirection="column" paddingLeft={4}>
              {prompt
                .split('\n')
                .slice(0, PROMPT_LINES)
                .map(line => (
                  <Text dimColor wrap="truncate-end">{line || ' '}</Text>
                ))}
              {prompt.split('\n').length > PROMPT_LINES && <Text dimColor>…</Text>}
              <Button
                plain
                label={text.copyPrompt}
                onPress={press => $.ui.copy({ text: prompt, surface: press.surface })}
              />
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text weight="bold" wrap="wrap">{cleanTitle(snap.title)}</Text>
        <Text>
          {barSegments(snap.items).map(s => (
            <Text color={COLOR[s.status]} dimColor={s.status === 'pendiente'}>
              {(s.status === 'pendiente' ? '░' : '█').repeat(s.cells)}
            </Text>
          ))}
          <Text weight="bold"> {percent}%</Text>
        </Text>
        <Text wrap="wrap">
          {BAR_ORDER.filter(s => count(s) > 0).map(s => (
            <Text color={COLOR[s]} dimColor={s === 'pendiente'}>
              {MARK[s]} {count(s)} {text.status[s]}{'   '}
            </Text>
          ))}
        </Text>
        <Text dimColor wrap="truncate-end">{text.edited(ago(snap.mtimeMs, now, current))}{next ? text.nextItem(labelOf(next)) : ''}</Text>
        {batch.length >= 2 &&
          (confirmingBatch ? (
            <Box flexDirection="row">
              <Text color="warning">{text.confirmLaunch(batch.map(labelOf).join(', '))}</Text>
              <Button plain label={text.yes} onPress={press => launchAll($, batch, snap, press.surface)} />
              <Text> / </Text>
              <Button plain dimColor label={text.no} onPress={() => update($, confirmBatch, () => false)} />
            </Box>
          ) : (
            <Button plain label={text.launchAll(batch.length)} onPress={() => update($, confirmBatch, () => true)} />
          ))}
        {drifting.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text weight="bold" color="warning">{text.driftsHeader(drifting.length)}</Text>
            {drifting.map(d => (
              <Box flexDirection="row" paddingLeft={2}>
                <Text wrap="truncate-end">
                  <Text weight="bold">{labelFor(d.id)}</Text>
                  <Text>  {d.reason}  </Text>
                </Text>
                <Button
                  plain
                  label={text.sync}
                  onPress={press => submit($, syncInstruction(d.id, snap.path, d.reason), press.surface, text.syncing(labelFor(d.id)))}
                />
              </Box>
            ))}
          </Box>
        )}
        {GROUPS.filter(s => count(s) > 0).map(status => {
          const isOpen = !folded.includes(status)
          const items = snap.items
            .filter(i => i.status === status)
            .sort((a, b) => prioRank(a.prio) - prioRank(b.prio))
          return (
            <Box
              flexDirection="column"
              marginTop={1}
              borderStyle="round"
              borderColor={COLOR[status] ?? 'subtle'}
              borderDimColor
              paddingX={1}
              gap={isOpen ? 1 : 0}
            >
              <Box flexDirection="row">
                <Button plain label={isOpen ? '▾' : '▸'} onPress={() => toggleGroup(status)} />
                <Text weight="bold" color={COLOR[status]}>
                  {' '}
                  {MARK[status]} {text.status[status].toUpperCase()}
                </Text>
                <Text dimColor> {items.length}</Text>
              </Box>
              {isOpen && items.map(itemRow)}
            </Box>
          )
        })}
        {snap.violations.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text weight="bold" color="warning">{text.violationsHeader(snap.violations.length)}</Text>
            {snap.violations.map(v => (
              <Text color="warning" wrap="truncate-end">  {v}</Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
