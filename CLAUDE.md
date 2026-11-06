# ami-claude-mods

- Any change that adds or edits what a mod draws (status line, toast, band, pane) or the text it shows must follow [docs/ui-guidelines.md](docs/ui-guidelines.md): glyph table, theme color tokens, length limits, and en+es strings in `messages.ts`. This keeps the mods visually consistent with each other.
- To add a new glyph meaning, add it to that table in both language versions before using it.
