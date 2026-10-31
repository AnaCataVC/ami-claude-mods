# cleanroom-guard

Enforces Double-Blind Cleanroom isolation for Test-Driven Development (TDD) subagents in Claude Code.

## Overview

In traditional agent workflows, automated test writers inspect production implementations and inadvertently confirm existing bugs. Under Cleanroom TDD, the implementer and the test writer are strictly isolated, operating exclusively against a formal contract. `cleanroom-guard` intercepts tool calls in subagent loops to guarantee information boundaries.

## Rules Enforced

- **Implementers (`ami-cleanroom-builder`, `code-implementer-jr`):** Strictly blocked from reading, searching, or writing test files (`tests/`, `*.test.ts`, `*_test.go`, etc.).
- **Test Authors (`ami-cleanroom-tester`, `test-writer-jr`):** Strictly blocked from reading uncommitted production source files or writing non-test code.
- **Contract Driven:** Compatible with `ami-orchestrate-cleanroom` from Amiga IA and general Cleanroom workflows.
