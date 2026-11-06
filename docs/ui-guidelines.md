# UI guidelines

[English](ui-guidelines.md) | [Español](ui-guidelines.es.md)

A small design system so every mod looks and speaks the same way. It covers only what the mods draw: status lines, toasts, the band above the prompt, and side panes. New mods follow it; changes to existing mods move them toward it.

## 1. Pick the lightest surface

| Need | Surface | Rule |
| :--- | :--- | :--- |
| A live value worth glancing at | Status line (`$.ui.status`) | Clear it (`undefined`) when there is nothing worth showing. |
| Something just happened, once | Toast (`$.ui.toast`) | At most one per event. Throttle anything that can repeat. |
| Something waits on the person | Band (`AbovePrompt`) | Render nothing (`next(e)`) when nothing is waiting. Max 3 rows. |
| Detail to browse | Pane (`$.ui.open`) | Opened by a slash command, never by itself. |

## 2. Status line

The host already shows the mod's name in front of the line, so the text never repeats it.

- **Form:** `{glyph} {value} {few words}`. Example: `✓ 47% of 60% today`.
- **Length:** 32 characters or fewer. The row truncates longer text.
- **No bars or gauges.** They take up the width that the number needs.
- **Separator:** ` · ` between parts, and two parts at most.

## 3. Toasts

- **Form:** `{what happened} · {detail}`, written as a sentence, with no mod-name prefix and no trailing period.
  - Example: `Daily target passed · 84% of your weekly limit used (target 60%)`.
- If an action follows, name it with the command: `… · review /closing-checklist`.

## 4. Glyphs: one meaning each

| Glyph | Meaning | Color token |
| :---: | :--- | :--- |
| `✓` | OK, done, on track | `success` |
| `◐` | In progress | `warning` |
| `⚠` | Needs attention, close to a limit | `warning` |
| `✕` | Blocked, failed, over a limit, mismatch | `error` |
| `○` | Ready to start | `suggestion` |
| `·` | Pending, not started | `dimColor` |
| `●` | Changed recently | `warning` |
| `?` | Someone asked a question | `warning` |
| `⛔` | Can block (a capability, not an error) | `warning` |
| `⏱` | Time spent blocked | `error` |
| `↻` `▶` `▾` `▸` `↳` `→` | Refresh, launch, collapse, expand, unblocks, transition | — |

Do not add a glyph for a meaning already in the table, and do not reuse a glyph for something else. To add a new meaning, add a row here first. Use no colored emoji (🔴 🟢 …): they render differently on each system and clash with the theme.

## 5. Color

- Use **theme tokens only**: `success`, `warning`, `error`, `suggestion`, `subtle`, `inactive`, `permission`, `claude`, `text`. Raw names (`yellow`, `magenta`, `red`) ignore the theme.
- Color carries severity, not decoration. Secondary text uses `dimColor`.

## 6. Panes and bands

- **Container:** `borderStyle="round"`, `borderDimColor`, `paddingX={1}`. The border color is the worst severity inside it (`success` when clean).
- **Bold:** spell it `weight="bold"`. Use it only for titles and the one value that matters.
- **Header row:** `↻ refresh` button (hotkey `r`) first, then a dim summary.
- **Empty state:** one dim sentence that says what to do: `No data. Press r to refresh.`
- **Buttons:** a lowercase verb, optionally led by a glyph from §4 (`▶ launch`), and a single-letter hotkey when it is frequent. Secondary buttons get `dimColor`.
- **Long lists:** show a few, then `+N more`.

## 7. Language

- Every string the person sees lives in the mod's `messages.ts`, in both `en` and `es`. That includes labels and section titles. Proper nouns (`GitHub`, `Docker`, `kubectl`) stay as they are.
- `CLAUDE_MODS_LANG=es` selects Spanish; anything else is English. Read it once on `session.start` with `langFrom`.
- Text addressed to the model (deny reasons, submitted prompts) is in English, so it reads the same for everyone.
