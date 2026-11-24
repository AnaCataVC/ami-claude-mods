# context-guard

Environment profile safety guard for GitHub accounts and Kubernetes clusters in Claude Code.

## Overview

Working across multiple GitHub accounts (e.g. personal vs work) and Kubernetes clusters carries significant operational risk. `context-guard` monitors your active GitHub CLI authentication and Kubernetes context, displays them continuously in the status line, detects production cluster environments, and blocks bare `kubectl` invocations that lack an explicit `--context` flag.

## Features

- **GitHub CLI Alignment:** Detects active user in `hosts.yml` and warns if operating in a project directory that expects a different account.
- **Production Kubernetes Safeguard:** Identifies production cluster contexts (`prod`, `production`, `live`) and flags them in the status line (`⚠ prod-cluster`). A GitHub account mismatch is flagged there too (`✕ other-user`). The status line stays within 32 characters: alerts come first, then the GitHub account (`✓ Work` when it matches a profile), then the cluster. The mod draws only the status line (no band, toast or pane).
- **Explicit Context Enforcement:** Blocks bare `kubectl` commands without `--context` to prevent accidental mutations when concurrent processes switch the global kube context.
- **Commit & Branch Protection (`disallowCommits`):** Optionally blocks `git commit`, branch creation (`git checkout -b`, `git switch -c`, `git branch <name>`), `git worktree add`, and commit-creating operations (`merge`, `rebase`, `cherry-pick`, `revert`, `am`) inside protected profile directories where changes must stay uncommitted in the working tree.
- **Configurable Profiles:** Define directory mappings via `context-guard.json` (see [`context-guard.example.json`](context-guard.example.json)).
- **Display Language:** Supports English (`en`, default) and Spanish (`es`) via the `CLAUDE_MODS_LANG` environment variable.

---

## Configuration

`context-guard` is completely self-contained and automatically discovers the current GitHub CLI account and active Kubernetes context from your machine. Directory-to-account mappings and enforcement policies can be customized in a local `context-guard.json` file (you can copy [`context-guard.example.json`](context-guard.example.json) as a starting point).

### Configuration Discovery & Precedence

At startup and during command execution, `context-guard` searches for its configuration in the following order:

1. `<current-project>/.claude/context-guard.json` (Project-specific setting, overrides global)
2. `<current-project>/context-guard.json` (Project root configuration)
3. `~/.claude/context-guard.json` (Global user profile; `%USERPROFILE%\.claude\context-guard.json` on Windows or `$HOME/.claude/context-guard.json` on Unix)

The first readable configuration file is loaded and applied.

### Schema Reference

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `profiles` | `Profile[]` | `[]` | List of directory profile rules matched against the session `cwd` (or `git -C <dir>` / `cd <dir>` targets). |
| `profiles[].path` | `string` | *(required)* | Base directory path for the profile. Matches the directory itself and any subdirectory (case-insensitive, slash-normalized). |
| `profiles[].expectedGhUser` | `string` | *(required)* | GitHub CLI username expected when working under `path`. Shows `✕ <active-user>` in the status line on mismatch. |
| `profiles[].label` | `string` | `expectedGhUser` | Short display label shown in the status line when the active account matches (e.g. `✓ Work`). |
| `profiles[].disallowCommits` | `boolean` | `false` | When `true`, blocks `git` commands that create commits, branches, or worktrees inside `path` and displays `no commits` in the status line. |
| `requireExplicitKubeContext` | `boolean` | `true` | Blocks online `kubectl` commands unless `--context <ctx>` is passed explicitly (offline subcommands like `config`, `version`, `help` remain allowed). |
| `warnProductionKube` | `boolean` | `true` | Prefixes the active Kubernetes context with `⚠` in the status line when its name contains `prod`, `production`, or `live`. |

### Fallback Behavior (Zero Configuration Required)

If no configuration file is found or if the file contains invalid JSON, `context-guard` defaults to safe baseline protections without requiring any external file:

```json
{
  "requireExplicitKubeContext": true,
  "warnProductionKube": true
}
```

Under fallback settings, bare `kubectl` commands without an explicit `--context` flag remain blocked, production cluster contexts continue to trigger status warnings, and the active GitHub CLI username is displayed directly in the status line.

### Automatic Environment Detection (Zero Hardcoding)

`context-guard` does not hardcode usernames, directories, or cloud profiles. Instead, it inspects your local environment dynamically:

- **Working Directory:** Queried via `$.session.cwd()` and matched against configured `profiles[].path`. Path comparisons normalize both forward and backward slashes and check subdirectories. Shell commands that change directory (`cd`, `Set-Location`, or `git -C <path>`) are also evaluated against `profiles[].path`.
- **Active GitHub CLI Account:** Inspected from local configuration:
  - Windows: `%APPDATA%/GitHub CLI/hosts.yml` or `%USERPROFILE%/.config/gh/hosts.yml`
  - Linux / macOS: `$HOME/.config/gh/hosts.yml`
- **Active Kubernetes Context:** Inspected from `%USERPROFILE%/.kube/config` (or `$HOME/.kube/config`). Production clusters are automatically detected if the context name contains `prod`, `production`, or `live`.

### Fresh Setup Example (Windows / macOS / Linux)

Copy [`context-guard.example.json`](context-guard.example.json) to `~/.claude/context-guard.json` (`%USERPROFILE%\.claude\context-guard.json` on Windows) and adjust your paths and GitHub handles:

```json
{
  "profiles": [
    {
      "path": "C:/Users/alice/WorkProjects",
      "expectedGhUser": "alice-work",
      "label": "Work",
      "disallowCommits": false
    },
    {
      "path": "C:/Users/alice/PersonalProjects",
      "expectedGhUser": "alice",
      "label": "Personal",
      "disallowCommits": false
    }
  ],
  "requireExplicitKubeContext": true,
  "warnProductionKube": true
}
```

> **Note:** Forward slashes (`/`) or escaped backslashes (`\\`) are both valid in path definitions. Replace `alice` with your local username and GitHub handles.

## Tests

```bash
claude plugin test mods/context-guard
```
