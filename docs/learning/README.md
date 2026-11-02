# Architecture Learnings & Engineering Patterns

[English](README.md) | [Español](README.es.md)

A curated knowledge base of architectural invariants, runtime gotchas, platform discoveries, and design patterns established while building, testing, and hardening `ami-claude-mods`.

---

## Catalog of Engineering Patterns

| Guide | Operational Domain | Key Focus |
| :--- | :--- | :--- |
| **[`engine-reference-top-level-scope.md`](engine-reference-top-level-scope.md)** | Runtime Engine / Static Analysis | Enforcing top-level module scope for engine references (`$`) to prevent closure leaks and satisfy the static validator. |
| **[`async-environment-resolution-fallbacks.md`](async-environment-resolution-fallbacks.md)** | Cross-Platform / Asynchronous | Preventing subtle truthy Promise bugs in environment fallbacks (`$.env.get`) with parallel `Promise.all` resolution. |
| **[`cleanroom-subagent-role-matching.md`](cleanroom-subagent-role-matching.md)** | Subagents / TDD Isolation | Precise role matching and namespace stripping for Double-Blind Cleanroom isolation without blocking general domain subagents. |
| **[`declarative-state-registration-types.md`](declarative-state-registration-types.md)** | State Management / TypeScript | Mandatory declaration of atomic keys in manifest type contracts (`interface PluginState`) to prevent collisions. |
| **[`packaging-and-marketplace-manifest-invariants.md`](packaging-and-marketplace-manifest-invariants.md)** | Packaging / Distribution | Square PNG icon constraints, backwards-compatible dual `hooks.json` schema, and clean release packaging. |
| **[`dual-host-interoperability-desktop-and-cli.md`](dual-host-interoperability-desktop-and-cli.md)** | Host Environments / UI Rendering | Full parity between Claude Desktop and Claude Code CLI, `~/.claude/settings.json` discovery, and `$.ui.resolve` surface adaptation. |

---

## Related Documentation

- **Architecture Specifications:** See [docs/architecture.md](../architecture.md) for execution models and event interception matrices.
- **Automations & Workflows:** See [docs/automations.md](../automations.md) for CI/CD pipelines, pre-push quality gates, and release packaging.
