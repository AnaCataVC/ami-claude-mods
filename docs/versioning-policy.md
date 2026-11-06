# Versioning Policy

`ami-claude-mods` is the source of truth for a personal set of Claude Desktop and Claude Code mods. It is installed locally (`npm run install-mods`) and evolves with the author's own workflow. That shapes how it is versioned.

## Policy: stay on 0.x

The repository stays on `0.x` indefinitely. There is no planned `1.0.0`.

- **Breaking changes may land in any minor release.** This includes slash command names, hook behavior, UI text, and persisted state keys. Example: `/checklist` became `/closing-checklist` in `v0.5.0` without an alias.
- **Patch releases** carry fixes and documentation only.
- **No deprecation cycles or compatibility aliases** are promised.
- Release notes list user-visible changes, so a breaking change is findable after the fact.

## Why not 1.0

A `1.0.0` promises stability to consumers. This repository has one consumer, the author, for whom a breaking change costs a `git pull`. A stability contract would add maintenance (aliases, deprecations, migration paths) and slow down iteration on personal tooling, with no one to benefit.

The mods also depend on host APIs that are not under this repository's control: the plugin runtime is in early access (`2.1.x`), and some mods use engine surfaces such as `$.session.usage` and session-management tools. Freezing this repository's contract would not protect it from upstream changes.

## When to revisit

Reconsider this policy only if the situation changes, for example:

- Other people start installing the mods and depend on their behavior.
- The plugin runtime reaches a documented stable API.

Until then, the guarantees are the existing quality gates: `npm run validate` and `npm test` pass on Linux, macOS, and Windows in CI before every release.
