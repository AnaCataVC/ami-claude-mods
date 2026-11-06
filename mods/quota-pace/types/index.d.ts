declare module 'claude-code' {
  interface PluginState {
    'quota-pace': { alertedSlot: string | null }
  }
}

export type QuotaPaceState = { alertedSlot: string | null }
