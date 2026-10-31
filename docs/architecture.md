# Architecture & Design Specifications

Comprehensive technical reference for `my-claude-mods`, explaining the integration model, lifecycle hooks, state persistence, and testing paradigms of Claude Code plugins.

---

## 1. Execution Sandbox & Isolation Model

Claude Code mods run in an ECMAScript module runtime hosted directly by the engine.

### Constraints & Invariants
- **No Direct Node.js APIs:** Plugins cannot import `node:fs`, `node:child_process`, or `node:path`. All filesystem and process calls are executed via `$.fs` and `$.process`.
- **Top-Level ES Modules:** Every hook file must be an ES module. Dynamic imports (`import()`) and CommonJS `require()` are prohibited.
- **Engine Reference Lifetime (`$`):** The engine reference passed into event handlers represents the active execution context. To satisfy static validation and avoid scope escapes, helper functions accepting `$` must be declared as top-level functions in the module.

---

## 2. Event Interception Matrix

The following table summarizes the engine events intercepted across the plugin suite:

```mermaid
sequenceDiagram
    autonumber
    actor User as Developer / Agent
    participant Engine as Claude Code Engine
    participant Guard as Pre-Tool Hooks (context-guard / cleanroom-guard / undelegated-reads)
    participant Tool as Tool Executor (Read, Bash, etc.)
    participant UI as Surface Render (AbovePrompt / Pane)

    User->>Engine: Issue Command or Prompt
    Engine->>Guard: tool.call Event
    alt Rule Violation Detected
        Guard-->>Engine: return { deny: reason }
        Engine-->>User: Rejection message displayed
    else Allowed
        Guard-->>Tool: next(e)
        Tool-->>Engine: Execution Result
        Engine->>UI: ui.render (Status Line / AbovePrompt)
    end
```

---

## 3. Reactive State Persistence

State that persists across turns within a session is declared using atoms:

```typescript
import { atom, read, update } from 'claude-code'

const countAtom = atom({ plugin: 'undelegated-reads', key: 'count' } as const, 0)
```

Atoms are typed by extending the `PluginState` interface in `types/index.d.ts`:

```typescript
declare module 'claude-code' {
  interface PluginState {
    'undelegated-reads': { count: number }
  }
}
```

---

## 4. Double-Blind Cleanroom Protocol

In Test-Driven Development (TDD), information isolation between implementer and tester is critical.

`cleanroom-guard` bridges Claude Code subagents with `ami-orchestrate-cleanroom` from Amiga IA:

1. **Implementer Boundary:**
   - Role: `ami-cleanroom-builder` or `code-implementer-jr`.
   - Blocked: Any read, search, or edit operation targeting test paths (`tests/`, `__tests__/`, `*.test.*`, `*_test.*`, `spec/`).
2. **Tester Boundary:**
   - Role: `ami-cleanroom-tester` or `test-writer-jr`.
   - Blocked: Reading uncommitted working tree diffs (`git diff`) or production source files (`.py`, `.ts`, `.go`, etc.).
   - Allowed: Writing tests and reading base committed versions via `git show HEAD:<path>`.
