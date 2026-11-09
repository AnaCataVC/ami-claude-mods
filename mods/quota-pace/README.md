# quota-pace

Spread your weekly Claude usage limit evenly across the days you actually work.

## Overview

On a subscription, Claude reports how much of the 7-day usage window you have used. `quota-pace` turns that number into a daily target. Each workday in the window gets an equal share. With the default Monday–Friday schedule, that means 20% by the end of Monday, 40% by Tuesday, 60% by Wednesday, and so on. The status line shows where you stand against today's target, and a toast warns you once per day when you go past it.

```
✓ 47% of 60% today
```

- First number: weekly limit used · second: today's target
- `✓` 5 or more points left · `⚠` under 5 points left · `✕` over today's target, with the overrun in parentheses: `✕ 65% of 60% today (+5)`

## How it works

- It reads the `seven_day` rate-limit window that the engine already reports. It listens to `session.measure` and does no polling and no network calls.
- The target follows the calendar week (Monday first) and does not depend on when your usage window resets. Today's target is the share of the workdays from Monday through today.
- Weekend days add nothing, so Saturday and Sunday keep Friday's 100%.
- Outside a subscription, where no weekly window is reported, the mod shows nothing.

## Configuration

| Option | Default | Description |
| :--- | :--- | :--- |
| `workdays` | `mon,tue,wed,thu,fri` | Days that get a share of the weekly limit, comma-separated. If none of the names are valid, it falls back to Mon–Fri. |

Set it from the config menu, or in `settings.json` under `pluginConfigs` → `quota-pace`. When the value changes, the mod reloads with it.

Display language follows the repo-wide `CLAUDE_MODS_LANG` setting (`es` for Spanish, English otherwise).
