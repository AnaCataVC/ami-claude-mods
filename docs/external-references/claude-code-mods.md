> **Created:** 2026-10-31
> **Last Updated:** 2026-11-25

# Claude Desktop & Claude Code Mods Architecture

Technical reference and specifications for Claude mods and plugins across **Claude Desktop** (integrated Code tab) and **Claude Code CLI**, based on the Anthropic 2.1.x Early Access plugin and function hooks engine.

---

## 1. Overview & Host Environments

Claude mods (plugins) are self-contained extensions that hook into engine events, tool execution lifecycles, slash command systems, and user interface surfaces. The engine powers two primary host environments with 100% feature and contract parity:

1. **Claude Desktop Application:**
   - The primary daily-driver GUI environment for developers.
   - Runs the engine inside the integrated **Code** tab.
   - Renders visual surfaces (`Pane`, `AbovePrompt`, `StatusBar`, `Toast`) as native desktop GUI panels, banners, status line widgets, and notifications.
   - Because desktop applications are launched without interactive CLI flags, configuration is driven declaratively via `~/.claude/settings.json` (`CLAUDE_CODE_PLUGIN_DIRS` or `"env": { "CLAUDE_CODE_PLUGIN_DIRS": "..." }`) and the *Code* ➔ *Customize* ➔ *Plugins* discovery menu.

2. **Claude Code CLI:**
   - The headless/terminal developer environment (`claude`).
   - Renders visual surfaces via React/Ink terminal abstractions directly into standard terminal emulators.
   - Supports ad-hoc session loading via `claude --plugin-dir <dir>` alongside environment variables and `settings.json`.

- **Runtime Sandbox:** Isolated ECMAScript module (ESM) runtime. Direct Node.js internal APIs (`fs`, `path`, `child_process`) and browser DOM are prohibited. All interactions flow through the Engine interface (`$`).
- **File Format & Extensions:** TypeScript/JSX (`.ts`, `.tsx`) or JavaScript (`.js`, `.jsx`, `.mjs`). Dynamic imports (`import()`) and CommonJS (`require()`) are prohibited.
- **JSX Compilation:** Compiles against custom globals `h` and `Fragment` (defined by the engine).
- **Validation & Testing:**
  - `claude plugin validate <dir>`: Validates manifest schema, hook subscriptions, and API compatibility.
  - `claude plugin test <dir>`: Executes test suite (`*.test.ts`, `*.test.tsx`) in headless mock engine.

---

## 2. Directory Structure of a Mod

A standard Claude Code mod contains:

```
<mod-name>/
├── .claude-plugin/
│   ├── plugin.json              # Mod manifest
│   └── types/                   # Auto-generated type definitions from Claude Code
│       ├── tsconfig.json
│       ├── claude-code/         # Engine & hook type definitions
│       ├── claude-code-tools/   # Built-in tool definitions
│       └── claude-code-mcp/     # Connected MCP tool definitions
├── hooks/
│   ├── hooks.json               # Entrypoint configuration
│   ├── register.tsx             # Main hook registration
│   └── *.ts / *.test.ts         # Logic, state machines, and unit tests
├── types/
│   └── index.d.ts               # Optional custom state and engine extension types
└── tsconfig.json                # Project TypeScript configuration
```

### Manifest Schema (`.claude-plugin/plugin.json`)
```json
{
  "name": "example-mod",
  "version": "1.0.0",
  "description": "Short description of what the mod does",
  "author": { "name": "Author Name" },
  "types": "./types/index.d.ts"
}
```

### Hooks Manifest (`hooks/hooks.json`)
```json
{
  "hooks": "./register.tsx"
}
```

---

## 3. Hook Registration & Lifecycle Events

Every mod exports a `register` function conforming to `Register`:

```typescript
import type { Register } from 'claude-code'

export const register: Register = (on, options) => {
  // Event subscriptions
}
```

### Available Engine Events

| Event | Matcher / Filter | Description | Interception Capability |
| :--- | :--- | :--- | :--- |
| `session.start` | None | Triggered on session initialization | Register commands (`$.command.register`), warm state |
| `session.end` | None | Triggered when session ends (exit, logout) | Post-session checks, toast notifications, cleanup |
| `session.receive`| None | Inbound cross-session / peer messaging | Intercept and record peer messages |
| `tool.call` | `{ tool: string \| RegExp }` | Pre-tool invocation interceptor | Deny execution (`return { deny: reason }`), modify, or audit |
| `prompt.submit` | None | Triggered when user submits prompt | Reset turn-based counters, inspect prompt input |
| `session.measure` | None | Triggered when engine measures session usage and a unit moved (`context`, `rateLimits`, `cost`) | Observe context fill, rate-limit windows (`five_hour`, `seven_day`, `spend_limit`), and session cost |
| `turn.complete` | None | Triggered when a model turn ends (main loop or subagent via `e.agentId`) | Inspect turn duration, token counts (`e.usage: TurnUsage`), or append summary |
| `command.run` | `{ command: string }` | Triggered when slash command runs | Execute command logic, open custom panes |
| `ui.render` | `{ component: 'AbovePrompt' \| 'Pane' \| ... }` | Dynamic terminal UI rendering | Return Ink-compatible JSX element tree |

---

## 4. Engine Interface (`$`) & Reactive State

The Engine Interface (`EngineInterface`) provides secure abstractions:

- **State Persistence (`atom`, `read`, `update`):**
  ```typescript
  import { atom, read, update } from 'claude-code'
  
  const count = atom({ plugin: 'my-mod', key: 'count' } as const, 0)
  
  // Read state
  const current = await read($, count)
  
  // Atomic update
  await update($, count, val => val + 1)
  ```
- **UI & Notifications:**
  - `$.ui.toast(message: string)`: Surface ephemeral notification.
  - `$.ui.status(text?: string)`: Set persistent status line indicator.
  - `$.ui.open({ id, title })`: Open a dedicated side pane.
  - `$.ui.resolve(e)`: Resolves reactive JSX components (`Box`, `Text`, `Button`) compatible with terminal rendering.
  - `$.ui.copy({ text, surface })`: Copy content to clipboard.
- **Process & Environment:**
  - `$.process.run(argv, { cwd, timeoutMs })`: Run sandboxed external process.
  - `$.fs.read(path)` / `$.fs.exists(path)` / `$.fs.list(path)`: Safe filesystem calls.
  - `$.env.get(varName)`: Read environment variables.
  - `$.session.cwd()` / `$.session.id()`: Get current session context.
  - `$.session.usage(args?)`: Read `{ startedAt, context, rateLimits, cost }`.
  - `$.agent.list()`: Inspect active subagents and their IDs, types, `tokenCount`, `usage` (`TurnUsage[]`), and `cost`.

---

## 4.1. Session Usage, Quota Rate Limits & Token Accounting (`2.1.332+`)

The engine exposes three distinct usage dimensions via `$.session.usage()` and the `session.measure` event (`SessionMeasureInput`):

1. **Account Rate-Limit Windows (`rateLimits: SessionRateLimit[]`):**
   - Reported by Anthropic API response headers on subscription plans (empty off a subscription or before the first API reading).
   - Each entry contains:
     - `kind`: `'five_hour'` (rolling 5-hour burst window), `'seven_day'` (weekly sustained window), or `'spend_limit'` (gateway token-estimated spend cap).
     - `percentUsed`: `number` from `0` to `100` with at most one decimal (`23.5`, `7`), or `> 100` when a spend limit is exceeded.
     - `resetsAt?: string`: ISO 8601 timestamp when the window resets.
   - **Important Scope Note:** `rateLimits` values are **account-wide** (spanning Claude Desktop, CLI, and web sessions). However, `session.measure` fires locally after each main-thread turn and whenever a rate-limit window moves a whole point (`e.changed.includes('rateLimits')`).
   - To measure how much quota percentage was consumed by the **current session**:
     - **Baseline Delta (`currentPercent - startPercent`):** Record the initial `percentUsed` (and `resetsAt`) on the first reading of the session. If `resetsAt` changes mid-session (window rollover), reset the baseline to `0`.
     - **Share of Consumed Quota (`(sessionDelta / currentPercent) * 100`):** Expresses what percentage of the currently consumed quota window occurred during this session.

2. **Live Context Window Fill (`context: SessionContextUsage`):**
   - Tracks the current session's active context window against the model's limit:
     - `tokens?: number`: Input tokens of the last API response (`input_tokens + cache_creation_input_tokens + cache_read_input_tokens`).
     - `window: number`: Model context window size in tokens.
     - `percent?: number`: `tokens / window` as a whole percentage (`0` to `100`).
   - Calling `$.session.usage({ breakdown: 'summary' | 'full' })` populates `context.breakdown` (`SessionContextBreakdown`), itemizing categories (`System prompt`, `System tools`, `Memory files`, `Messages`, `Free space`, `Auto-compact buffer`) with each category's `percentage` of the window.

3. **Per-Turn & Subagent Token / Cost Attribution (`TurnUsage`, `AgentInfo`, `SessionCost`):**
   - `turn.complete` provides `e.usage?: TurnUsage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `model`) and `e.agentId?: string` (`undefined` on the main loop; set to the subagent's ID for in-process `Agent` runs).
   - `$.agent.list()` returns `AgentInfo[]` for in-process subagents and teammates, where each agent carries its own `tokenCount`, `contextWindowSize`, `usage?: TurnUsage[]`, and `cost?: SessionCost`.
   - **Separate Child Sessions vs. In-Process Subagents:**
     - **Separate Child Sessions** (launched as independent `claude` processes, e.g., via `orchestrate-plan` or desktop sessions) run their own isolated engine instance, status bar, `$.state` atoms, and `session.start` lifecycle. They do **not** share `turn.complete` or `context` with the parent session, though they share account-wide `rateLimits` from the server.
     - **In-Process Subagents** (spawned via the `Agent` tool within a single session) share the host process and trigger `turn.complete` with `e.agentId !== undefined`, while keeping their own isolated `contextWindowSize` and `usage` array in `$.agent.list()`.

---

## 5. UI Elements & Surface Types

The engine maps UI components to the appropriate visual host abstraction:

- **`AbovePrompt`**:
  - **Claude Desktop:** Renders a prominent banner or notification bar right above the chat/code input box.
  - **Claude Code CLI:** Renders persistent status rows directly above the interactive terminal prompt.
- **`Pane`**:
  - **Claude Desktop:** Renders as an interactive sidebar drawer inside the Code tab, supporting rich interactive controls (`Button` with `onPress`).
  - **Claude Code CLI:** Renders as a dedicated side-by-side terminal viewport or interactive modal panel.
- **`StatusBar` (`$.ui.status`)**:
  - **Claude Desktop:** Status line indicator at the bottom edge of the Code workspace.
  - **Claude Code CLI:** Bottom-most pinned terminal status line.
- **`Toast` (`$.ui.toast`)**:
  - **Claude Desktop:** Native desktop toast notification popup.
  - **Claude Code CLI:** Brief transient alert banner in the terminal stream.

---

## 6. Testing Framework (`claude-code/testing`)

Plugin unit tests run with `claude plugin test <dir>` using the built-in mock runner:
```typescript
import { describe, expect, test } from 'claude-code/testing'

test('feature behaviour test', async ($, on) => {
  // Exercise register, mock engine tools, verify UI mount or state updates
})
```

---

## 7. External Documentation References

- [Claude Code Plugins & Manifest Architecture Specification](https://github.com/anthropics/claude-code)
- [Anthropic Developer Documentation: Plugins, Hooks and Custom Extensions](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)
- [Claude Desktop Integrated Code Experience & Global Settings Guide](https://docs.anthropic.com/en/docs/claude-desktop)
