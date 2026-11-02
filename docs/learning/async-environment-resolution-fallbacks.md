# Pattern: Cross-Platform Asynchronous Environment Coalescence

## Context & Challenge

Mods and function hooks must operate reliably across diverse operating systems (Windows, macOS, Linux). Environment variable names for standard system paths diverge across platforms:
- **Home Directory:** Windows sets `USERPROFILE`, whereas Unix (macOS / Linux) sets `HOME`.
- **Temporary Directory:** Windows uses `TEMP` or `TMP`, while Unix uses `TMPDIR` or defaults to `/tmp`.

In standard Node.js scripts, developers write synchronous fallback expressions using `process.env`:

```javascript
const homeDir = process.env.USERPROFILE ?? process.env.HOME
```

However, inside Claude mods, direct access to `process.env` is restricted by the sandbox. Environment variables must be retrieved through the asynchronous engine interface:

```typescript
$.env.get(name: string): Promise<string | undefined>
```

---

## The Subtle Bug: Un-Awaited Promise Coalescence

Because `$.env.get()` returns a `Promise`, attempting to write synchronous coalescence expressions produces a silent failure:

```typescript
// SUBTLE BUG: An un-awaited Promise is always truthy!
const homeDir = (await $.env.get('USERPROFILE')) ?? $.env.get('HOME')
```

Or even more deceptively:

```typescript
// CATASTROPHIC BUG: Left side evaluates to Promise object (truthy), right side NEVER runs!
const homeDir = $.env.get('USERPROFILE') ?? $.env.get('HOME')
```

On Linux and macOS workstations where `USERPROFILE` is undefined:
1. `$.env.get('USERPROFILE')` returns a `Promise` that resolves to `undefined`.
2. In the expression `$.env.get('USERPROFILE') ?? $.env.get('HOME')`, the `Promise` object itself is truthy.
3. The nullish coalescing operator (`??`) assumes the left-hand side is present and never executes the right-hand side (`HOME`).
4. The plugin attempts to use the unresolved `Promise` as a path string or resolves `undefined`, failing silently in Unix environments.

---

## The Solution Pattern: Parallel Asynchronous Coalescence

Always resolve fallback environment variables in parallel using `await Promise.all()`:

```typescript
import type { EngineInterface } from 'claude-code'

async function resolveHomeDirectory($: EngineInterface): Promise<string> {
  const [userProfile, home] = await Promise.all([
    $.env.get('USERPROFILE'),
    $.env.get('HOME'),
  ])
  
  const resolved = userProfile ?? home
  if (!resolved) {
    throw new Error('Unable to resolve user home directory: USERPROFILE and HOME are both unset')
  }
  return resolved
}
```

### Temporary Directory Fallback Chain

Similarly, for temporary file handling (e.g. scratchpad inspection in `close-checklist`):

```typescript
async function resolveTempDirectory($: EngineInterface): Promise<string> {
  const [temp, tmp, tmpdir] = await Promise.all([
    $.env.get('TEMP'),
    $.env.get('TMP'),
    $.env.get('TMPDIR'),
  ])
  return temp ?? tmp ?? tmpdir ?? '/tmp'
}
```

### Key Takeaways
- Never use `??` or `||` directly on calls to `$.env.get()` without `await`.
- Use `Promise.all` to fetch both primary and secondary candidate variables in a single asynchronous turn, avoiding sequential latency.
