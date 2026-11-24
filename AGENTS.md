# AGENTS.md — Repository Directives & Invariants (`ami-claude-mods`)

Directives and constraints for AI coding agents and contributors working in `ami-claude-mods`.

---

## 1. Self-Containment & Zero Local Coupling

1. **Zero Local Machine Paths or Personal Handles:**
   - Never commit real machine paths (e.g., `C:\Users\<real-user>\...`, `/Users/<real-user>/...`, `~/Repos`, `~/SimplitSolutions`) or real personal/work GitHub account handles into source code, tests, skills, or documentation.
   - Use synthetic placeholders (`C:/Users/alice/...`, `C:/Users/username/...`, `C:/proj`, `/repo`) in examples and unit tests.
   - At runtime, resolve all system paths dynamically via `$.env.get('USERPROFILE')`, `$.env.get('HOME')`, `$.env.get('APPDATA')`, `$.env.get('CLAUDE_CONFIG_DIR')`, `$.env.get('TEMP')`, and `$.env.get('TMPDIR')`.

2. **Zero Private/Work Skill or Ticket References:**
   - Never reference private or company-specific skills (such as `simpli-*`), internal repositories, or real project ticket codes (such as `ADA-*`, `H1-HUB`, `H3-HUB`, `P3-HUB3`, `E2.2`, etc.) in code comments, bundled skills (`SKILL.md`), tests, or documentation.
   - Always use generic identifiers in examples and tests (`PROJ-101`, `API-1`, `T2.2`, `P1-a`).

3. **External Public Ecosystems (`amiga-ia`) Must Be Strictly Optional:**
   - Every mod in this repository must work **100% standalone** out of the box without requiring external plugins or skills to be installed.
   - Integration with the public **[Amiga IA (`amiga-ia`)](https://github.com/AnaCataVC/amiga-ia)** ecosystem (such as `ami-orchestrate-cleanroom`, `ami-cleanroom-builder`, `ami-cleanroom-tester`) must always be documented as **optional** and linked to `https://github.com/AnaCataVC/amiga-ia`, while supporting generic standalone role names (`cleanroom-builder`, `cleanroom-tester`, `code-implementer`, `code-implementer-jr`, `test-writer`, `test-writer-jr`).

4. **Local Configuration Files (`~/.claude/*`) Must Be Optional, Documented & Gitignored:**
   - Any mod or bundled skill that reads a user- or machine-specific configuration file outside the repository (such as `~/.claude/context-guard.json` or `~/.claude/orchestrate-plan.local.md`) must:
     1. Treat the external file as **strictly optional** and provide a safe, self-contained fallback when the file is absent.
     2. Document the file location, precedence, schema/format, fallback behavior, and a synthetic example in the mod's `README.md` (and provide a `*.example.json` template when applicable).
     3. Keep local configuration patterns (`context-guard.json`, `orchestrate-plan.local.md`, `*.local.json`, `*.local.md`) in `.gitignore` so personal settings are never committed.

5. **Self-Contained Mod Configurations & Release Archives:**
   - Each mod's `tsconfig.json` must extend `../../tsconfig.json` and include `hooks`, `types`, and `.claude-plugin/types` (never depend solely on gitignored `.claude-plugin/types/tsconfig.json`).
   - Each mod's `hooks/hooks.json` must use the dual backwards-compatible schema `{ "hooks": {}, "modules": ["./register.tsx"] }`.
   - `scripts/package-all.js` (`npm run package`) must exclude development and engine-generated artifacts (`.claude-plugin/types`, `*.test.ts`, `*.test.tsx`, `tsconfig.json`, `*.tsbuildinfo`) so every distributed `.zip` archive is clean and standalone.

---

## 2. UI Consistency & Bilingual Messages

- Any change that adds or edits what a mod draws (status line, toast, band, pane) or the text it shows must follow [docs/ui-guidelines.md](docs/ui-guidelines.md): glyph table, theme color tokens, length limits, and `en` + `es` strings in `messages.ts`.
- To add a new glyph meaning, add it to that table in [docs/ui-guidelines.md](docs/ui-guidelines.md) before using it.

---

## 3. Engine & Validation Invariants

- Follow all engine rules in [.agents/rules/claude-code-mods.md](.agents/rules/claude-code-mods.md):
  - Declare any helper receiving `$` (`EngineInterface`) at module top-level scope.
  - Declare every state atom (`atom({ plugin, key })`) in `types/index.d.ts` under `interface PluginState`.
  - Await environment lookups in parallel with `await Promise.all([...])`.
  - Run `npm run validate` and `npm test` before committing or pushing.
