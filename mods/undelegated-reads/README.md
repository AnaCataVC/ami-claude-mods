# undelegated-reads

Context window protection and exploration delegation meter for Claude Code.

## Overview

`undelegated-reads` prevents the main interactive session from consuming large portions of its context window on consecutive mechanical file reads and codebase searches (`Read`, `Grep`, `Glob`, `rg`, `Select-String`). It shows a warning on the status line and blocks the assistant to delegate exploration to background subagents when reaching the threshold.

## Behavior

- Shows a status line only from the 7th consecutive read (`⚠ 7/10 reads without delegating`, or `⚠ 7/10 lecturas sin delegar` with `CLAUDE_MODS_LANG=es`); below that the status is cleared. There is no band or pane.
- Blocks the 10th consecutive mechanical read, reminding the agent to delegate to an explorer subagent.
- Automatically resets when `Agent` or `Task` is invoked, or when a new human prompt is submitted.
