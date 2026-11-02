# Pattern: Packaging & Marketplace Manifest Invariants

## Context & Challenge

Distributing mods via local plugin paths, GitHub Releases, or developer catalogs requires satisfying strict manifest schemas and asset formats enforced by the Claude plugin validator.

---

## 1. Square Icon Geometry & Compression

The plugin validator and marketplace portal enforce strict rules for plugin icons:
- **Geometry:** Must be strictly square (1:1 aspect ratio), with dimensions between 512x512 and 2048x2048 pixels.
- **Format:** PNG format only (vector SVGs and non-square assets trigger validation warnings or failures).
- **File Size:** Must remain below 2 MB.
- **Location:** Place at `.claude-plugin/icon.png` or reference via the `"icon"` field in `plugin.json`:
  ```json
  {
    "name": "hooks-viewer",
    "version": "1.0.0",
    "icon": "./icon.png"
  }
  ```

---

## 2. Cross-Version Hook Manifest Compatibility (`hooks.json`)

Between Claude Code 2.1 minor releases, the schema for `hooks/hooks.json` evolved:
- Earlier versions expected a `"hooks"` object mapping event names.
- Later versions introduce a `"modules"` array listing hook entrypoint files (`./register.tsx`).

To ensure total backwards and forwards compatibility across CI environments, local developer machines, and future engine releases:

```json
{
  "hooks": {},
  "modules": ["./register.tsx"]
}
```

This prevents validation errors in environments expecting the legacy `"hooks"` object while providing the modern `"modules"` array.

---

## 3. Exclusion Patterns for Release Packaging

When generating distribution `.zip` archives (e.g. `npm run package` via `scripts/package-all.js`):
- **Exclude Dev Artifacts:** Never package `*.test.ts`, `*.test.tsx`, `tsconfig.json`, `coverage/`, `.git/`, or IDE caches.
- **Clean Bundle Generation:** Use native archive commands (`tar -a -cf` on Windows/Linux) to avoid external runtime dependencies.
- **Standalone Distribution:** Each mod archive in `releases/` (e.g. `ami-claude-mods-hooks-viewer-v0.2.0.zip`) must be directly extractable into `~/.claude/mods/`.
