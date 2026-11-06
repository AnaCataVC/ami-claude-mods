// Consecutive Grep/Glob/Read calls of the main session since the last Agent/Task, kept in
// memory per session. Resets to 0 at the call that is blocked.
export type MechanicalCount = number

declare module 'claude-code' {
  interface PluginState {
    'undelegated-reads': { lang: 'en' | 'es'; count: MechanicalCount }
  }
}
