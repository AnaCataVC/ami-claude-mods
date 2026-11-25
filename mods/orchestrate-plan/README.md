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

## Drift Detection & Session Matching

- **Session matching:** Executor sessions launched from the pane are titled `<id> · <Nombre>` (or `<id1> + <id2> · <Nombre>` when one session covers several rows). When matching live sessions to rows, the pane accepts `·`, ` - ` (hyphen surrounded by spaces), `–`, `—`, or `:` as the separator between the ID prefix and the title, so hyphenated IDs (`P1-b`) remain intact even in multi-ID session titles (`P1-b + P1-c - Title`).
- **Merged PR drift:** To avoid false alarms when an open row mentions earlier merged PRs in its free `Estado` note, PR drift checks take PR URLs from the `Espera a` column when present (falling back to the row's URLs otherwise) and only flag a drift when the **last** listed PR is `MERGED`.

## Known limitations

- **Only the session's primary folder is searched.** When a session is opened with several folders, the automatic search looks in the first one (the session's working directory) and the folders above it. Mods cannot see the others: the engine exposes only `$.session.cwd()`. A plan in another folder is tracked when you pass its path (`/plan-progress <path>`) or as soon as the session writes or edits that plan file.

## Local rules (Optional)

`orchestrate-plan` works out of the box with zero external configuration. If you have machine- or repository-specific launch rules (such as repositories where executors must leave changes uncommitted, repositories that should be launched from the CLI instead of `start_session`, or ticket-only prompt conventions), you can optionally place them in `~/.claude/orchestrate-plan.local.md` (`%USERPROFILE%\.claude\orchestrate-plan.local.md` on Windows), outside this repository.

When `~/.claude/orchestrate-plan.local.md` exists, the `orchestrate-plan` skill reads it before launching an executor session; if the file is absent, the skill proceeds with its standard launch flow.

Example `~/.claude/orchestrate-plan.local.md`:

```markdown
# Local Orchestrator Rules

- **No-commit repositories:** For items targeting `~/work/legacy-api`, instruct executors not to create commits or branches; leave changes in the working tree for manual review.
- **Model overrides:** Use `sonnet` for documentation-only items and `opus` for cross-service migrations.
```

## Tests

```bash
claude plugin test mods/orchestrate-plan
```
