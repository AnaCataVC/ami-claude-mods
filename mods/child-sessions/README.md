# child-sessions

Cross-session and inter-agent message inbox rendered above the prompt for Claude Code.

## Overview

In multi-agent environments or cross-session orchestrations, child sessions and peer agents frequently send status updates or ask blocking questions. `child-sessions` intercepts inbound cross-session messages, prioritizes pending questions, and renders an actionable inbox directly above the prompt.

## Features

- **Actionable Buttons:** `[reply]` automatically submits an answering instruction, `[view]` / `[hide]` toggles the full message view, and `[dismiss]` archives the notification.
- **Priority Sorting:** Questions requiring human or orchestrator decisions are highlighted with the warning color and sorted to the top.
- **Clean Addressing:** Supports both `SendMessage` and session management tools.
