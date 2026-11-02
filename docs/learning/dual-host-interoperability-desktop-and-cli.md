# Pattern: Dual-Host Interoperability (Claude Desktop vs Claude Code CLI)

## Context & Challenge

The Anthropic Claude developer ecosystem provides two complementary execution environments:
1. **Claude Desktop Application:** The daily-driver graphical environment, featuring the integrated **Code** tab.
2. **Claude Code CLI:** The headless terminal executable (`claude`).

Developers using both surfaces need extensions that work identically across both hosts without duplicating codebase logic or maintaining separate forks for GUI and terminal.

---

## 1. Declarative vs Flag-Driven Discovery

A fundamental operational difference between the desktop app and the CLI is how plugins are loaded:

| Dimension | Claude Desktop Application | Claude Code CLI |
| :--- | :--- | :--- |
| **Startup Mechanism** | Launched via OS GUI / window manager | Launched via terminal commands |
| **CLI Flags (`--plugin-dir`)** | Not accessible during standard application launch | Supported (`claude --plugin-dir <dir>`) |
| **Canonical Discovery Path** | Global `~/.claude/settings.json` (`CLAUDE_CODE_PLUGIN_DIRS`) | `~/.claude/settings.json`, shell profile, or CLI flag |
| **GUI Discovery Menu** | *Code* ➔ *Customize* ➔ *Plugins* | `/plugin` slash commands |

### The Universal Configuration Standard

To provide seamless, zero-friction discovery across both Claude Desktop and the CLI, configure `CLAUDE_CODE_PLUGIN_DIRS` inside `~/.claude/settings.json`:

```json
{
  "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/child-sessions:~/.claude/mods/cleanroom-guard:~/.claude/mods/close-checklist:~/.claude/mods/context-guard:~/.claude/mods/hooks-viewer:~/.claude/mods/undelegated-reads"
}
```

*(On Windows, paths are separated by semicolons `;`)*.

By synchronizing mods to `~/.claude/mods/` using `npm run install-mods` and setting this global configuration, both **Claude Desktop** and **Claude Code CLI** load the suite automatically on every run.

---

## 2. Surface Resilience via `$.ui.resolve`

Mods define visual UI components using React/Ink JSX primitives (`Box`, `Text`, `Button`). The engine interface method `$.ui.resolve` maps these components to the appropriate visual host abstraction:

- **`Pane` Surfaces:**
  - **Claude Desktop:** Renders as an interactive sidebar drawer inside the Code tab, supporting full mouse click interactions on buttons (`[reply]`, `[dismiss]`, `[refresh]`).
  - **Claude Code CLI:** Renders as an interactive side-by-side terminal viewport or modal.
- **`AbovePrompt` Surfaces:**
  - **Claude Desktop:** Anchored as a high-visibility notification band directly above the code/chat prompt input box.
  - **Claude Code CLI:** Pinned as status rows directly above the interactive terminal prompt.
- **`StatusBar` (`$.ui.status`):**
  - **Claude Desktop:** Renders in the bottom status line of the Code workspace.
  - **Claude Code CLI:** Pinned to the bottom-most terminal line.
- **`Toast` (`$.ui.toast`):**
  - **Claude Desktop:** Triggers native operating system notifications.
  - **Claude Code CLI:** Prints transient alert banners into the terminal output stream.

### Architectural Invariant
Because the engine abstracts surface rendering behind `$.ui.resolve`, mods must never make assumptions about terminal columns, ANSI escape codes, or DOM nodes. Writing to standard JSX primitives guarantees 100% host interoperability.
