export type Profile = {
  path: string
  expectedGhUser: string
  label?: string
  disallowCommits?: boolean
}

export type ContextGuardConfig = {
  profiles?: Profile[]
  requireExplicitKubeContext?: boolean
  warnProductionKube?: boolean
}

export type Snapshot = {
  gh: string | null
  kube: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'context-guard': {
      lang: 'en' | 'es'
      config: ContextGuardConfig | null
    }
  }
}
