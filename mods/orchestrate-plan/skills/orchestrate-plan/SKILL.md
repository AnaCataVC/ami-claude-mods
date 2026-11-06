---
name: orchestrate-plan
description: Keeps an orchestrator session's plan.md in the contract the plan pane reads. Use when asked "orquesta este plan", "arma el plan.md", "actualiza el plan", "lanza las sesiones del plan", "orchestrate this plan".
---

# Orchestrate a Plan

A session that splits work into executor sessions keeps its plan in its working folder, in a `.md` whose name contains `plan` (`plan.md`, `PLAN.md`, `rollout-plan.md`). When several qualify, the newest one with a work table wins; with none in the folder, the nearest `plan.md` above it. The `orchestrate-plan` plugin that ships this skill reads it into the "Avance del plan" pane (`/plan-progress`), shows a status line, and toasts each status change. It only reads what follows this contract.

## The contract

1. **Title**: the first `# ` heading.
2. **Work table**: one Markdown table whose header has an `Id` column and an `Estado` (or `Status`) column. Optional columns `Nombre` (or `Título`, `Name`), `Prio` and `Espera a` (or `Bloqueo`). The section name and the column order are free.
   - **`Nombre` is what a human reads**: 2-5 words saying what the item delivers ("Rechazo no reintentable"), never the ticket code or a restated id. The pane leads every row, dependency (`espera …`), toast and button with it and shows the id dimmed; a row without one falls back to the words after the id in its `###` prompt heading, then to the bare id. Every row gets one when the plan is built or migrated.
3. **One row per launchable item**, finished items included. A finished item stays as a row with `hecho`; it never moves out of the table. That is what makes the progress bar count items against items.
4. **Estado starts with exactly one of** `pendiente`, `listo`, `en curso`, `bloqueado`, `hecho`, optionally followed by ` — ` and a free note:
   - `pendiente`: nothing prepared yet.
   - `listo`: prompt or ticket ready, no session launched.
   - `en curso`: an executor session is working on it.
   - `bloqueado`: waiting on something outside the plan; say what in `Espera a`.
   - `hecho`: merged or closed; the note carries the PR link.
   Anything else shows as `?` in the pane, as a contract violation to fix.
5. **Each id has one status in the whole file.** Prose sections (decisions, context, a `## Hecho` narrative) are allowed but never restate an item's status.
6. **No live state copied by hand.** PR review state, CI, deployed versions: query them with `gh` when updating the plan, and write only the resulting Estado.

## A plan outside the contract

`/plan-progress <path>` tracks any file, e.g. one plan mode wrote under `~/.claude/plans/`. A plan file the session itself wrote or edited (plan-named, or any `.md` under a `plans` folder) is tracked automatically, so `/plan-progress` with no path reopens it. With neither, the mod reads only the cwd and the folders above it: in a session opened with several folders it never sees the others, so a plan living in a non-primary folder needs `/plan-progress <path>` (or one edit to the file) to be tracked. When the pane says "Sin tabla con columnas Id y Estado", or asked to "arma la tabla del plan":

1. Build the work table in that same file, right after the context: one row per launchable unit the plan already names (chips, PRs, tickets, phases), with its Id as the plan spells it, an Estado from the contract, and `Espera a` from the dependencies the prose states. Never invent work the plan does not name.
2. Set each Estado from live sources (`gh`, `ListAgents`, the ticket), not from the prose.
3. Remove the status the prose restated (rule 5), and turn any older table that tracked the same items into the work table instead of keeping both.
4. Show the table and run `/plan-progress <path>`.

A plan that only exists in the conversation is written to a file first. Never write `plan.md` in the home folder or another shared folder: the upward search would show it in every session beneath it.

## Maintaining it

On every advance (a PR merged or deployed, a ticket changing state, a new decision, a report from an executor):

1. Update the Estado cell of each affected row. The orchestrator keeps the decisions and the messages to executors; the bookkeeping of each report (verify its claims against the source, update the Estado, rewrite the prompts it affects) goes to one Sonnet subagent per batch of reports, which returns only the verdict. Run batches one at a time with the orchestrator not editing the plan meanwhile, and after each one re-read the table: same id count and the expected Estado changes only.
2. Rewrite pending prompts whose context changed. What is already on `main` is stated as verified done (`file:line` or the PR URL), never as work to do.
3. Keep launch prompts as `###` blocks under a `##` section whose title says "Prompts", ordered by priority label (P0…, P1…); a new one goes in its place, never at the end. **Each `###` heading names its item's id exactly as in the table** (`### P1-c · H3-HUB …`): that is how the pane offers "ver prompt" on a `listo` row. A finished item's prompt shrinks to one line with its link.
4. Every launch prompt ends with a REPORT block telling the executor how to reach the orchestrator and to report progress, result and every question there, not to the user directly. The block carries the orchestrator's folder, its `local_…` id (`get_session self`) as the `session_id` for `mcp__ccd_session_mgmt__send_message` (`SendMessage` cannot address `local_…` ids), and `ListAgents` by name as the fallback. When the orchestrator session changes, refresh that id in every pending prompt. An executor whose item ends in a PR does not wait for approval or merge: once the PR is open and self-reviewed, it checks nothing is left unpushed, sends the orchestrator its full report (PR URL, what was done per scenario, decisions, what stayed out, any hub/consumer prompt draft) as text or as a file outside its worktree, leaves its worktree with `ExitWorktree` keeping the branch, and archives itself. It never deletes its branch: review fixes still need it. The orchestrator takes over following the PR and deletes the local and remote branch once the PR is merged (the row turns `hecho`); first it calls `mcp__ccd_host__clean_up_worktrees` for the executor's worktree, since the executor left it with `ExitWorktree` keeping the folder and nobody else removes it.
5. Asked to launch an item (the pane's "▶ lanzar" sends that turn): `start_session` with its `###` prompt verbatim, then set its Estado as item 10 says. The executor's `cwd` is the item's repo checkout taken from its row; the orchestrator itself is never a worktree. Each `###` prompt must carry the commit/push/PR authorization it relies on; without it the executor stops and reports the question to the orchestrator, who relays it to the user. Repo- or machine-specific launch rules (repos where executors must not commit, repos launched from the CLI instead, ticket-only prompts) live in `~/.claude/orchestrate-plan.local.md`; read it before launching when it exists. Executors get the model their work needs, not the orchestrator's: read-only investigations and mechanical pieces launch on Sonnet (`model` in `start_session`), code with judgment on Opus.
6. Before offering the next item, rank the `listo`/`pendiente` rows whose `Espera a` is clear by Prio and check file overlap between them; offer the highest-priority one, not the one the latest event unblocked, and name the items that conflict.
7. Before changing a branch an executor session owns (fixes, review replies), check whether that session is still alive (`ListAgents`); if it is, send the work to it instead of committing over it.
8. A real review finding is fixed in the PR that surfaced it when it belongs to that PR's own work; propose a separate ticket only when it is another team's area or the user asks for one.
9. **Session naming**: the executor session's title is exactly `<id> · <Nombre>` (`P3-HUB3 · Regla de rechazo`). The pane matches session and row by the id prefix to flag drift under "⚠ DESFASES", whose "sincronizar" button sends the turn to re-check that row against its source and fix its Estado. When a row's `Nombre` changes or a session was launched without the convention, rename it with `set_session_title` (`mcp__ccd_session_mgmt__set_session_title`) to `<id> · <Nombre>`; never put the status in the title, the pane already shows it.
10. **Session addressing**: right after `start_session`, write the Estado as `en curso — sesión <título> (<local_… id>)`. Messages to an executor go with `mcp__ccd_session_mgmt__send_message` and that id as `session_id` (never the display name, which can be renamed), kept to 2-3 lines plus a file path when longer. Executors reach the orchestrator as item 4 specifies. Wait for replies with `notify_when_idle`, not by polling.

Project-specific gates (who approves tickets, review rules, lanes) live in that plan's own intro, not here.

## Migrating an existing plan

Before rewriting a plan another session is editing, confirm that session is idle, show the diff, and check that the number of ids (open plus done) is the same before and after.
