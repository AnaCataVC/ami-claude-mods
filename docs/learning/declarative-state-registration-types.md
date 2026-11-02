# Pattern: Mandatory Declarative State Registration in TypeScript Manifests

## Context & Challenge

Claude mods provide reactive state persistence across turns within a session using atomic stores:

```typescript
import { atom, read, update } from 'claude-code'

const countAtom = atom({ plugin: 'undelegated-reads', key: 'count' } as const, 0)
```

During unit testing with headless mocks (`claude-code/testing`), state operations execute smoothly in memory even if the keys are defined purely in code.

However, when running static verification (`claude plugin validate <mod>`) or packaging for distribution, the validator inspects the relationship between the manifest's `types` contract and the atom keys used in code.

---

## The Static Validation Failure

If a plugin manages state keys via `atom({ plugin, key })` without formally typing them in the manifest contract, the validator aborts with:

```
undelegated-reads.count is not declared: the manifest's types contract must name it in interface PluginState
```

This gate exists to guarantee cross-plugin state isolation:
- Prevents accidental state key collisions between multiple third-party plugins loaded into the same session.
- Allows the host engine to track memory allocation and serialize session state safely.

---

## The Solution Pattern: Extending `interface PluginState`

Every mod that uses reactive atoms MUST declare its state schema by augmenting the `'claude-code'` module in `types/index.d.ts` and linking it in `.claude-plugin/plugin.json`.

### 1. Declare State in `types/index.d.ts`

```typescript
// types/index.d.ts
import type { PeerMessage } from '../hooks/types'

declare module 'claude-code' {
  interface PluginState {
    'child-sessions': {
      peers: Record<string, PeerMessage>
      subagentNames: Record<string, string>
      dismissed: string[]
      expanded: string | null
    }
    'undelegated-reads': {
      count: number
    }
  }
}
```

### 2. Reference in Manifest (`.claude-plugin/plugin.json`)

```json
{
  "name": "child-sessions",
  "version": "1.0.0",
  "description": "Cross-session and inter-agent message inbox rendered above the prompt",
  "author": { "name": "Catalina Villalobos" },
  "types": "./types/index.d.ts"
}
```

### 3. Create Typed Atoms in Hooks

When calling `atom()`, use `as const` on the descriptor object to match the declared contract:

```typescript
import { atom } from 'claude-code'

export const peersAtom = atom(
  { plugin: 'child-sessions', key: 'peers' } as const,
  {}
)
```

### Key Takeaways
- Mocked unit tests can pass without manifest type augmentation; always run `npm run validate` / `claude plugin validate` to verify static compliance.
- Every state atom key in `atom({ plugin, key })` must match a field under `PluginState['<mod-name>']`.
