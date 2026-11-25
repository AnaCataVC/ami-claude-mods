export type WindowLedger = {
  lastPercentUsed: number
  sessionUsed: number
  resetsAt?: string
}

export type SessionShareLedger = {
  windows: Record<string, WindowLedger>
  mainTokensSinceMeasure: number
  subagentTokensSinceMeasure: number
  isMainTurnActive: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'session-share': {
      ledger: SessionShareLedger | null
    }
  }
}

export type SessionShareState = {
  ledger: SessionShareLedger | null
}
