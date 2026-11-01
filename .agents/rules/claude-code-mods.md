# Claude Code Plugin & Function Hooks Development Guidelines

Directives and invariants for developing, testing, and packaging plugins for Claude Code CLI (2.1+).

---

## 1. Top-Level Function Scope for Engine Reference (`$`)
- **Engine Reference Invariant:** NEVER pass the engine instance `$` (`EngineInterface`) to closures, arrow functions, or lambdas declared inside the `export const register: Register = on => { ... }` block.
- Any helper function that requires `$` MUST be declared at the module's top level:
  ```typescript
  async function helper($: EngineInterface) {
    // safe engine calls
  }
  ```
- Failure to do this causes `claude plugin validate` to reject the plugin with `$ is passed to "fn", which is not a function declared at the top of this file`.

---

## 2. Manifest & Hook Registration Schemas
- **`hooks/hooks.json` Structure:** Always include `{ "hooks": {}, "modules": ["./register.tsx"] }` to ensure compatibility across Claude Code versions (including older CI validator releases that expect a `"hooks"` object):
  ```json
  { "hooks": {}, "modules": ["./register.tsx"] }
  ```
- **Declarative State Registration:** Any atomic state key defined via `atom({ plugin: '<mod-name>', key: '<key>' })` MUST be formally typed in `types/index.d.ts` extending `interface PluginState`:
  ```typescript
  declare module 'claude-code' {
    interface PluginState {
      '<mod-name>': {
        '<key>': StateType
      }
    }
  }
  ```
- Omission of state declarations results in immediate validation failure.

---

## 3. Cross-Platform Asynchronous Environment Coalescence
- **Await Environment Resolution:** `$.env.get()` returns a `Promise`. NEVER coalesce environment variables synchronously without `await` (e.g. `$.env.get('A') ?? $.env.get('B')`), as an un-awaited `Promise` is always truthy, silently ignoring fallback variables.
- Always resolve in parallel with `await Promise.all`:
  ```typescript
  const [userProfile, home] = await Promise.all([
    $.env.get('USERPROFILE'),
    $.env.get('HOME'),
  ])
  const homeDir = userProfile ?? home
  ```
- Support Unix fallbacks: `USERPROFILE` -> `HOME`, `TEMP` -> `TMPDIR` -> `/tmp`.

---

## 4. Exact Subagent Role Matching (Cleanroom & Gating)
- **Avoid Over-Broad Regexes:** In tool interceptors (`tool.call`) gating subagent capabilities by role (e.g., Cleanroom TDD), do not use broad substring matches like `/builder/i` or `/tester/i`. These inadvertently block domain agents such as `page-builder` or `qa-reviewer`.
- Use explicit lookup sets (`new Set(['ami-cleanroom-builder', 'code-implementer-jr'])`) and strip plugin/package namespaces before matching.

---

## 5. Diagnostic Privacy & Log Hygiene
- Never output raw user configurations (`$HOME\.claude\settings.json`) or environment files into shell outputs or commit logs.
- Use targeted filters (`Select-String -Pattern ...`) scoped strictly to required metadata.

---

## 6. Pre-Push Validation & Packaging Quality Gates
- **Static Schema Validation:** Always execute `npm run validate` prior to proposing commits or PRs to guarantee that all plugin manifests (`plugin.json`), hook bindings (`hooks.json`), and type contracts satisfy Claude Code runtime requirements.
- **Packaging Integrity:** Run `npm run package` to verify that release distribution archives (`dist/<mod>.zip`) compile cleanly and exclude development caches, temporary files, and test mocks.
- **Hook Setup:** Ensure repository hooks are configured locally via `npm run prepare` (`scripts/setup-hooks.js`).

