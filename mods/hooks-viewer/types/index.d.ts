export type HookRow = { event: string; source: string; matcher: string; command: string; timeout?: number }
export type ModRow = { name: string; version: string; description: string }

declare module 'claude-code' {
  interface PluginState {
    'hooks-viewer': { lang: 'en' | 'es'; rows: Shaped<HookRow[]>; mods: Shaped<ModRow[]> }
  }
}
