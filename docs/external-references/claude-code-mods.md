> **Created:** 2026-10-31
> **Last Updated:** 2026-10-31

# Claude Code Mods & Function Hooks Architecture

Technical reference and specifications for Claude Code mods (plugins) based on Claude Code 2.1.x Early Access plugin and function hooks engine.

---

## 1. Overview & Execution Model

Claude Code mods (plugins) are self-contained extensions that hook into Claude Code's engine events, tool execution lifecycle, command system, and user interface.

- **Runtime Environment:** Isolated ECMAScript module (ESM) runtime. No Node.js APIs (`fs`, `path`, `child_process` directly), no DOM. All interactions happen through the Claude Code Engine interface (`$`).
- **File Format & Extensions:** TypeScript/JSX (`.ts`, `.tsx`) or JavaScript (`.js`, `.jsx`, `.mjs`). Dynamic imports (`import()`) and CommonJS (`require()`) are prohibited.
- **JSX Compilation:** Compiles against custom globals `h` and `Fragment` (defined by Claude Code).
- **Tooling Commands:**
  - `claude plugin validate <dir>`: Validates manifest, event subscriptions, and API compatibility before loading.
  - `claude plugin test <dir>`: Executes test suite (`*.test.ts`, `*.test.tsx`) in headless mock engine.
- **Discovery & Installation:** Loaded from directories specified in `CLAUDE_CODE_PLUGIN_DIRS` or configured in user/project settings.

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
  - `$.agent.list()`: Inspect active subagents and their IDs/types.

---

## 5. UI Elements & Surface Types

Claude Code renders UI components using terminal abstractions:
- **`AbovePrompt`**: Renders banner or indicator rows above the primary interactive prompt.
- **`Pane`**: Renders an interactive sidebar or secondary viewport opened via slash commands or events. Supports interactive elements like `Button` with `onPress`.

---

## 6. Testing Framework (`claude-code/testing`)

Plugin unit tests run with `claude plugin test <dir>` using the built-in mock runner:
```typescript
import { describe, expect, test } from 'claude-code/testing'

test('feature behaviour test', async ($, on) => {
  // Exercise register, mock engine tools, verify UI mount or state updates
})
```
