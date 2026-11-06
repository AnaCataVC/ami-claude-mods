export type ComposeProject = {
  // Executable family: `docker compose` or the legacy `docker-compose`.
  legacy: boolean
  files: string[]
  project?: string
  // Directory the command ran from; where `ps` must run to see the same project.
  dir: string
}

export type Tracked = {
  containers: { name?: string; image?: string }[]
  composes: ComposeProject[]
  volumes: string[]
  files: string[]
  // Commands launched with run_in_background: the session cannot tell when they end.
  background: string[]
  isWorktreeOpen: boolean
  // Scheduled tasks and crons created and not deleted by this session.
  schedules: number
}

export type ChecklistItem = { ok: boolean; text: string }
export type ChecklistSection = { title: string; items: ChecklistItem[] }

declare module 'claude-code' {
  interface PluginState {
    'close-checklist': { lang: 'en' | 'es'; tracked: Tracked; sections: ChecklistSection[] | null }
  }
}
