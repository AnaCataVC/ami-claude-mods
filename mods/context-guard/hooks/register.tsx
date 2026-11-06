import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextGuardConfig, Snapshot } from '../types'
import { denyCommand } from './commands'
import { langFrom } from './messages'
import type { Lang } from './messages'
import { MIN_GAP_MS, isContextCommand, parseGhAccount, parseKubeContext, statusText } from './context'

const configAtom = atom({ plugin: 'context-guard', key: 'config' } as const, null as ContextGuardConfig | null)
const langAtom = atom({ plugin: 'context-guard', key: 'lang' } as const, 'en' as Lang)

type Engine = EngineInterface

async function readFirst($: Engine, paths: string[]): Promise<string | null> {
  for (const path of paths) {
    const text = await $.fs.read(path).catch(() => null)
    if (text !== null) return text
  }
  return null
}

async function loadConfig($: Engine): Promise<ContextGuardConfig> {
  const cwd = await $.session.cwd()
  const [userProfile, homeEnv] = await Promise.all([$.env.get('USERPROFILE'), $.env.get('HOME')])
  const home = userProfile ?? homeEnv
  const candidates = [
    `${cwd}/.claude/context-guard.json`,
    `${cwd}/context-guard.json`,
    ...(home ? [`${home}/.claude/context-guard.json`] : []),
  ]
  const content = await readFirst($, candidates)
  if (!content) return { requireExplicitKubeContext: true, warnProductionKube: true }
  try {
    return JSON.parse(content) as ContextGuardConfig
  } catch {
    return { requireExplicitKubeContext: true, warnProductionKube: true }
  }
}

async function readSnapshot($: Engine): Promise<Snapshot> {
  const [appData, userProfile, homeEnv] = await Promise.all([
    $.env.get('APPDATA'),
    $.env.get('USERPROFILE'),
    $.env.get('HOME'),
  ])
  const home = userProfile ?? homeEnv
  const [hosts, kubeConfig] = await Promise.all([
    readFirst($, [
      ...(appData ? [`${appData}/GitHub CLI/hosts.yml`] : []),
      ...(home ? [`${home}/.config/gh/hosts.yml`] : []),
    ]),
    readFirst($, home ? [`${home}/.kube/config`] : []),
  ])
  return {
    gh: hosts === null ? null : parseGhAccount(hosts),
    kube: kubeConfig === null ? null : parseKubeContext(kubeConfig),
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
  await update($, langAtom, () => langFrom(raw))
}

let lastRunAt = 0
let inFlight: Promise<void> | null = null

async function readAndPublish($: Engine): Promise<void> {
  try {
    const [next, config] = await Promise.all([readSnapshot($), loadConfig($)])
    await update($, configAtom, () => config)
    $.ui.status(statusText(next, await $.session.cwd(), config, await read($, langAtom)))
  } finally {
    lastRunAt = await $.clock.now()
    inFlight = null
  }
}

async function refresh($: Engine, force: boolean): Promise<void> {
  while (inFlight) await inFlight
  if (!force && (await $.clock.now()) - lastRunAt < MIN_GAP_MS) return
  inFlight = readAndPublish($)
  await inFlight
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadLang($)
    await refresh($, true).catch(() => undefined)
    return next(e)
  })

  for (const tool of ['Bash', 'PowerShell'] as const) {
    on('tool.call', { tool }, async ($, e, next) => {
      const config = await read($, configAtom) ?? undefined
      const reason = denyCommand(e.command, await $.session.cwd(), config)
      if (reason !== undefined) return { deny: reason }
      const ran = await next(e)
      await refresh($, isContextCommand(e.command)).catch(() => undefined)
      return ran
    }).catch(($, e, next) => next(e))
  }
}
