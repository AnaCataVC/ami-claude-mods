# hooks-viewer

Interactive inspector panel and slash command listing all configured settings hooks and loaded mods with their origins in Claude Code.

## Overview

`hooks-viewer` provides runtime transparency for developers using Claude Code function hooks and plugins. It inspects all settings layers (`user`, `project`, `local`, `flag`, `policy`) and active plugin directories (`CLAUDE_CODE_PLUGIN_DIRS`), rendering an interactive side pane and answering the `/hooks-panel` slash command.

## Usage

- The pane does not open at session start. Run `/hooks-panel` to open it focused (it also replies with the text report).
- Press `r` (refresh) to reload hooks and mod manifests.
