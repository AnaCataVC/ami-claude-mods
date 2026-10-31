# context-guard

Environment profile safety guard for GitHub accounts and Kubernetes clusters in Claude Code.

## Overview

Working across multiple GitHub accounts (e.g. personal vs work) and Kubernetes clusters carries significant operational risk. `context-guard` monitors your active GitHub CLI authentication and Kubernetes context, displays them continuously in the status line, detects production cluster environments, and blocks bare `kubectl` invocations that lack an explicit `--context` flag.

## Features

- **GitHub CLI Alignment:** Detects active user in `hosts.yml` and warns if operating in a project directory that expects a different account.
- **Production Kubernetes Safeguard:** Identifies production cluster contexts (`prod`, `production`, `live`) and displays warning banners above the prompt.
- **Explicit Context Enforcement:** Blocks bare `kubectl` commands without `--context` to prevent accidental mutations when concurrent processes switch the global kube context.
- **Configurable Profiles:** Define directory mappings via `context-guard.json`.
