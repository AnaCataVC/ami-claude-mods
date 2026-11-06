export type PlanStatus = 'pendiente' | 'listo' | 'en curso' | 'bloqueado' | 'hecho'

export type WorkItem = {
  id: string
  // Human-readable name from the Nombre column; the pane leads with it and shows the id dimmed.
  title?: string
  prio: string
  waitsOn: string
  // undefined when the Estado cell does not start with a PlanStatus word.
  status?: PlanStatus
  note: string
  // GitHub PR URLs anywhere in the row, Markdown link targets included.
  prUrls: string[]
}

export type PlanSnapshot = {
  path: string
  title: string
  items: WorkItem[]
  violations: string[]
  mtimeMs: number
  // Launch prompt body by item id, for the items whose prompt the plan holds.
  prompts: Record<string, string>
  // When each item last changed status while this session watched the plan.
  changedAt: Record<string, number>
  // First time each item was seen in its current status, across sessions.
  since: Record<string, number>
}

// A row where the plan disagrees with the live sessions or GitHub, and why.
export type Drift = { id: string; reason: string }

declare module 'claude-code' {
  interface PluginState {
    'orchestrate-plan': {
      lang: 'en' | 'es'
      plan: PlanSnapshot | null
      drifts: Drift[]
      collapsed: PlanStatus[]
      openPrompt: string | null
      // The item whose launch awaits a "sí", and when each item's launch was last asked for.
      confirmLaunch: string | null
      confirmBatch: boolean
      launchedAt: Record<string, number>
    }
  }
}
