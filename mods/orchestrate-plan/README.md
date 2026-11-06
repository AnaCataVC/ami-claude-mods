# orchestrate-plan

Live progress pane for an orchestrator session's `plan.md`, plus the skill that keeps the plan in the contract the pane reads.

## Overview

A session that splits work into executor sessions keeps a Markdown plan with a work table (`Id`, `Estado`, optional `Nombre`, `Prio`, `Espera a`). This plugin reads the nearest plan into a side pane, shows a status line, toasts each status change, flags drift against live sessions and merged PRs, and offers buttons to view or launch an item's prompt.

## Contents

- `hooks/`: the mod (`register.tsx`) with its parser (`parse.ts`), drift detection (`reconcile.ts`) and launch helpers (`launch.ts`).
- `skills/orchestrate-plan/SKILL.md`: the plan contract and how the orchestrator maintains it and launches executors.

## Usage

- `/plan-progress` opens the pane for the plan in the current folder (or the nearest `plan.md` above it).
- `/plan-progress <path>` tracks any plan file.
- Ask Claude to "orchestrate this plan" to load the skill.

## Known limitations

- **Only the session's primary folder is searched.** When a session is opened with several folders, the automatic search looks in the first one (the session's working directory) and the folders above it. Mods cannot see the others: the engine exposes only `$.session.cwd()`. A plan in another folder is tracked when you pass its path (`/plan-progress <path>`) or as soon as the session writes or edits that plan file.

## Local rules

Machine- or repo-specific launch rules go in `~/.claude/orchestrate-plan.local.md`, outside this repo. The skill reads that file before launching an executor, if it exists.

## Tests

```bash
claude plugin test mods/orchestrate-plan
```
