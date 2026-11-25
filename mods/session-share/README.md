# session-share

See what percentage of your consumed 5-hour and 7-day Claude quota was spent in the current session, isolated from nested or parallel sessions.

## Overview

When working across multiple Claude Desktop tabs, CLI terminals, or nested executor sessions, the account-wide usage percentages reported by Claude (`five_hour` and `seven_day`) combine everything your account has consumed. `session-share` attributes quota consumption strictly to the current main session and displays the proportion (`0%`–`100%`) of your total consumed quota that happened here:

```
✓ here 25%·10%
```

- First number: share of your currently consumed 5-hour window spent in this session · second: same for the 7-day window. With only one window reported: `✓ here 25% 5h`. In Spanish, `here` is `aquí`.
- `✓` under 50% of consumed quota · `⚠` 50%–79% · `✕` 80% or more of your consumed quota came from this session

## How it works

- **100% Standalone:** Reads `five_hour` and `seven_day` directly from `$.session.usage().rateLimits` and `session.measure`. Requires no other mod (`quota-pace` is not required) and makes no network calls.
- **Isolated from Nested & Parallel Sessions:** Each Claude process runs its own `session-share` ledger and status bar. Quota increases that occur while this session is idle (consumed by another terminal or a nested child session) are not credited to this session.
- **Isolated from In-Process Subagents:** Listens to `turn.start` and `turn.complete` (`e.agentId` and `e.usage`). When in-process subagents (`Agent` tool) run inside the session, quota increments are weighted by token footprint (`TurnUsage`) so only the main session loop (`e.agentId === undefined`) is credited.
- **Window Rollover & `/clear`:** Automatically resets the window baseline when `resetsAt` rolls over to a new window or when `/clear` starts a fresh conversation.
- Outside a subscription, where no rate-limit windows are reported, the mod shows nothing.

## Configuration

Display language follows the repo-wide `CLAUDE_MODS_LANG` setting (`es` for Spanish, English otherwise).

## Tests

```bash
claude plugin test mods/session-share
```
