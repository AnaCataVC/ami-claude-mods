# Pattern: Top-Level Module Scope for Engine Reference (`$`)

## Context & Problem

Claude plugin hooks are authored using the `register` hook function conforming to the `Register` interface:

```typescript
import type { Register } from 'claude-code'

export const register: Register = (on, options) => {
  // Hook subscriptions
}
```

When building complex plugins (such as `hooks-viewer` or `child-sessions`), event handlers frequently require utility and helper functions to inspect state, query the environment, or manipulate UI surfaces. Developers naturally tend to extract these helpers as inline functions or arrow functions within the `register` closure:

```typescript
// ANTI-PATTERN: Triggers static validator failure
export const register: Register = on => {
  const readSettings = async ($: EngineInterface) => {
    return await $.settings.read('user')
  }

  on('session.start', async ($) => {
    const settings = await readSettings($)
  })
}
```

When running static verification (`claude plugin validate <mod>`), the engine's static analyzer rejects this structure with the following error:

```
$ is passed to "readSettings", which is not a function declared at the top of this file
```

---

## Architectural Root Cause

The Claude Code plugin engine enforces strict capability and lifetime isolation. The engine reference (`$`) passed into event handlers represents the execution context of that specific event. 

To prevent:
1. Leaking the engine instance outside the active turn boundary,
2. Unobserved closures retaining stale engine handles across session cycles,
3. Non-deterministic asynchronous side-effects,

the static analyzer strictly requires that any helper function accepting `$` as a parameter MUST be declared as a module top-level function (`function` or `async function`).

---

## The Solution Pattern

Declare all helper and utility functions accepting `$` at the module's top level outside the `register` closure:

```typescript
import type { EngineInterface, Register } from 'claude-code'

// TOP-LEVEL DECLARATION: Satisfies static analysis
async function readSettings($: EngineInterface): Promise<Record<string, unknown>> {
  return (await $.settings.read('user')) ?? {}
}

export const register: Register = on => {
  on('session.start', async ($) => {
    const settings = await readSettings($)
    // Safe processing
  })
}
```

### Key Invariants
- **Top-Level Keyword:** Use standard `async function <name>($: EngineInterface) { ... }` or `function <name>($: EngineInterface) { ... }` at the root of the file.
- **Type Annotations:** Import and annotate with `EngineInterface` from `'claude-code'`.
- **Zero Inline Leakage:** Never pass `$` into callbacks created inside component render trees or lambda handlers without binding it through top-level dispatchers.
