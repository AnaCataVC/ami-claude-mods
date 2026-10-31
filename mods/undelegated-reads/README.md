# undelegated-reads

Context window protection and exploration delegation meter for Claude Code.

## Overview

`undelegated-reads` prevents the main interactive session from consuming large portions of its context window on consecutive mechanical file reads and codebase searches (`Read`, `Grep`, `Glob`, `rg`, `Select-String`). It displays a visual gauge on the status bar and prompts the assistant to delegate exploration to background subagents when reaching the threshold.

## Behavior

- Displays a status gauge: `undelegated reads ▰▰▰▰▰▱▱▱▱▱ 5/10`.
- Warns above the prompt when approaching the limit.
- Blocks the 10th consecutive mechanical read, reminding the agent to delegate to an explorer subagent.
- Automatically resets when `Agent` or `Task` is invoked, or when a new human prompt is submitted.
