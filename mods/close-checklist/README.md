# close-checklist

Pre-exit inspection pane and safety checklist tracking uncommitted Git status, running Docker containers, and active background resources before closing a Claude Code session.

## Overview

When pair-programming with autonomous agents, temporary resources often linger after a session terminates (detached Docker containers, dangling background tasks, unpushed Git commits, or scratchpad notes). `close-checklist` automatically tracks resource creation during the session, exposes an interactive `/cierre` command, and alerts you via toast before exiting if items require your attention.

## Features

- **Git Status:** Uncommitted changes, unpushed commits, detached HEAD.
- **Docker Monitoring:** Detached containers, Compose projects, and volumes created during the session.
- **Background Jobs:** Warns about commands started with `run_in_background`.
- **Scratchpad:** Checks for files remaining in the session scratchpad directory.
