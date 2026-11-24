# cleanroom-guard

Enforces Double-Blind Cleanroom isolation for Test-Driven Development (TDD) subagents in Claude Code.

## Overview

In traditional agent workflows, automated test writers inspect production implementations and inadvertently confirm existing bugs. Under Cleanroom TDD, the implementer and the test writer are strictly isolated, operating exclusively against a formal contract. `cleanroom-guard` intercepts tool calls in subagent loops to guarantee information boundaries.

## Rules Enforced

- **Implementers (`cleanroom-builder`, `code-implementer`, `code-implementer-jr`, `ami-cleanroom-builder`):** Strictly blocked from reading, searching, or writing test files (`tests/`, `*.test.ts`, `*_test.go`, etc.).
- **Test Authors (`cleanroom-tester`, `test-writer`, `test-writer-jr`, `ami-cleanroom-tester`):** Strictly blocked from reading uncommitted production source files or writing non-test code.
- **Standalone & Ecosystem Ready:** Works standalone with any subagent matching the Cleanroom role names above, and integrates optionally with `ami-orchestrate-cleanroom` from [Amiga IA (`amiga-ia`)](https://github.com/AnaCataVC/amiga-ia).
