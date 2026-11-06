# context-guard

Environment profile safety guard for GitHub accounts and Kubernetes clusters in Claude Code.

## Overview

Working across multiple GitHub accounts (e.g. personal vs work) and Kubernetes clusters carries significant operational risk. `context-guard` monitors your active GitHub CLI authentication and Kubernetes context, displays them continuously in the status line, detects production cluster environments, and blocks bare `kubectl` invocations that lack an explicit `--context` flag.

## Features

- **GitHub CLI Alignment:** Detects active user in `hosts.yml` and warns if operating in a project directory that expects a different account.
- **Production Kubernetes Safeguard:** Identifies production cluster contexts (`prod`, `production`, `live`) and flags them in the status line (`⚠ prod-cluster`). A GitHub account mismatch is flagged there too (`✕ other-user`). The status line stays within 32 characters: alerts come first, then the GitHub account (`✓ Work` when it matches a profile), then the cluster. The mod draws only the status line (no band, toast or pane).
- **Explicit Context Enforcement:** Blocks bare `kubectl` commands without `--context` to prevent accidental mutations when concurrent processes switch the global kube context.
- **Configurable Profiles:** Define directory mappings via `context-guard.json`.

---

## Configuration

`context-guard` automatically discovers the current GitHub CLI account and active Kubernetes context from your machine. Directory-to-account mappings and enforcement policies are defined in a local `context-guard.json` file.

### Configuration Discovery & Precedence

At startup and during command execution, `context-guard` searches for its configuration in the following order:

1. `<current-project>/.claude/context-guard.json` (Project-specific setting, overrides global)
2. `<current-project>/context-guard.json` (Project root configuration)
3. `~/.claude/context-guard.json` (Global user profile; `%USERPROFILE%\.claude\context-guard.json` on Windows or `$HOME/.claude/context-guard.json` on Unix)

The first readable configuration file is loaded and applied.

### Fallback Behavior

If no configuration file is found or if the file contains invalid JSON, `context-guard` defaults to safe baseline protections:

```json
{
  "requireExplicitKubeContext": true,
  "warnProductionKube": true
}
```

Under fallback settings, bare `kubectl` commands without an explicit `--context` flag remain blocked, and production cluster contexts continue to trigger status warnings.

### Automatic Environment Detection (Zero Hardcoding)

`context-guard` does not hardcode usernames, directories, or cloud profiles. Instead, it inspects your local environment dynamically:

- **Working Directory:** Queried via `$.session.cwd()` and matched against configured `profiles[].path`. Path comparisons normalize both forward and backward slashes and check subdirectories.
- **Active GitHub CLI Account:** Inspected from local configuration:
  - Windows: `%APPDATA%/GitHub CLI/hosts.yml` or `%USERPROFILE%/.config/gh/hosts.yml`
  - Linux / macOS: `$HOME/.config/gh/hosts.yml`
- **Active Kubernetes Context:** Inspected from `%USERPROFILE%/.kube/config` (or `$HOME/.kube/config`). Production clusters are automatically detected if the context name contains `prod`, `production`, or `live`.

### Fresh Setup Example (Windows)

For a fresh setup on Windows, copy the template or create `%USERPROFILE%\.claude\context-guard.json`:

```json
{
  "profiles": [
    {
      "path": "C:/Users/alice/WorkProjects",
      "expectedGhUser": "alice-work",
      "label": "Work"
    },
    {
      "path": "C:/Users/alice/PersonalProjects",
      "expectedGhUser": "alice",
      "label": "Personal"
    }
  ],
  "requireExplicitKubeContext": true,
  "warnProductionKube": true
}
```

> **Note:** Forward slashes (`/`) or escaped backslashes (`\\`) are both valid in path definitions. Replace `alice` with your local Windows username and GitHub handles.
