# Key Learnings & Architectural Invariants

[English](learnings.md) | [Español](learnings.es.md)

A record of technical discoveries, runtime constraints, and lessons learned while developing, testing, and hardening plugins for Claude Code CLI (Early Access 2.1+).

---

## 1. Static Validation Constraints on the Engine Interface (`$`)

Claude Code's plugin validator (`claude plugin validate <dir>`) runs static analysis on hook modules before loading them. One crucial constraint discovered is the **top-level scope requirement for `$`**:

- **Problem:** Passing `$` to an inline function or helper declared inside `export const register: Register = on => { const helper = async ($) => { ... } }` triggers a compilation error:
  ```
  $ is passed to "helper", which is not a function declared at the top of this file
  ```
- **Solution:** Any utility or helper function that receives the engine parameter `$` must be declared as a module top-level function (`async function helper($: Engine) { ... }`).

---

## 2. Asynchronous Environment Fallback Pitfalls

When authoring cross-platform plugins intended for both Windows and Unix (macOS / Linux):

- **Problem:** Writing `await $.env.get('USERPROFILE') ?? await $.env.get('HOME')` without parentheses or writing `$.env.get('A') ?? $.env.get('B')` creates a subtle bug: because `$.env.get()` returns a `Promise`, an un-awaited expression evaluates to a truthy object. The right-hand side (`HOME`) is never evaluated, causing the plugin to fail silently on Linux/macOS.
- **Solution:** Parallel resolution with `await Promise.all`:
  ```typescript
  const [userProfile, home] = await Promise.all([
    $.env.get('USERPROFILE'),
    $.env.get('HOME'),
  ])
  const homeDir = userProfile ?? home
  ```

---

## 3. Precision in Subagent Role Interception (Cleanroom TDD)

Implementing Double-Blind Cleanroom isolation requires intercepting subagent tool calls based on their role (`agent.type`):

- **Problem:** Naive regular expressions like `/(implementer|builder)/i` and `/(tester|qa)/i` are too greedy. They erroneously block unrelated user agents such as `page-builder` or `qa-reviewer` from performing legitimate reads.
- **Solution:** Scope matches to explicit known Cleanroom agent types (`ami-cleanroom-builder`, `code-implementer-jr`, `ami-cleanroom-tester`, `test-writer-jr`) and strip any leading package/plugin namespaces before evaluating.

---

## 4. Mandatory State Registration in Manifest Types

Reactive atoms (`atom({ plugin, key })`) provide memory persistence across turns within a session:

- **Problem:** Creating an atom whose key is not declared in `types/index.d.ts` extending `interface PluginState` passes unit tests if mocked, but fails `claude plugin validate` with:
  ```
  <mod>.<key> is not declared: the manifest's types contract must name it in interface PluginState
  ```
- **Solution:** Always declare all state atoms in the plugin's `types/index.d.ts` contract before using them in hooks.

---

## 5. Plugin Distribution & Marketplace Packaging

- **Icons:** The developer portal and validator enforce square PNG icons (512x512 to 2048x2048 px, < 2 MB) located at `.claude-plugin/icon.png` or specified via `icon` in `plugin.json`.
- **Manifest:** `hooks/hooks.json` should specify `{ "hooks": {}, "modules": ["./register.tsx"] }` to maintain cross-version compatibility across Claude Code releases (preventing validation rejections in environments expecting a `"hooks"` object).
- **Command-line flags:** In addition to `CLAUDE_CODE_PLUGIN_DIRS`, Claude Code natively supports testing and loading mods via `claude --plugin-dir <dir>`.

---

## 6. Related Documentation

- **Architecture & Design Specifications:** See [Architecture Specifications](architecture.md) for execution models and event interception matrices.
- **Automations & CI/CD Pipelines:** See [Automations & Workflow Reference](automations.md) for validation scripts and GitHub Actions workflows.

