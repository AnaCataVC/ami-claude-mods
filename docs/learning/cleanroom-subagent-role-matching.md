# Pattern: Exact Subagent Role Matching for Double-Blind Cleanroom TDD

## Context & Challenge

In autonomous AI pair-programming, Test-Driven Development (TDD) suffers from confirmation bias when test writers inspect source code implementations before drafting assertions. 

Under the **Double-Blind Cleanroom** protocol (orchestrated via `ami-orchestrate-cleanroom` from Amiga IA and enforced by `cleanroom-guard`):
- The **Builder** (`ami-cleanroom-builder`, `code-implementer-jr`) writes production code against a formal contract and is strictly barred from viewing or editing test files.
- The **Tester** (`ami-cleanroom-tester`, `test-writer-jr`) writes automated tests against the contract and is strictly barred from inspecting production implementation diffs.

To enforce these boundaries, `cleanroom-guard` intercepts tool execution calls (`tool.call` for `Read`, `Grep`, `Glob`, `Write`, `Edit`, `Bash`, `PowerShell`) and inspects the identity of the calling agent.

---

## The Anti-Pattern: Over-Broad Role Matching

Initially, role detection relied on naive regex matching against subagent identifiers:

```typescript
// ANTI-PATTERN: Greedy regex matching
const isBuilder = /builder/i.test(agentRole)
const isTester = /tester|qa/i.test(agentRole)
```

### The Failure Mode
In real-world workflows, developers invoke independent domain subagents whose names contain common engineering terms:
- `page-builder`: Blocked from reading test templates even though it is an unrelated UI scaffolding subagent.
- `bundle-builder`: Blocked from compiling test assets.
- `qa-reviewer` or `system-tester`: Inadvertently blocked from inspecting diffs for non-Cleanroom code reviews.

---

## The Solution Pattern: Scoped Matching with Namespace Stripping

To guarantee zero false positives on unrelated subagents while maintaining strict Cleanroom boundaries:

1. **Explicit Role Allowlist Sets:** Use dedicated `Set` collections of recognized Cleanroom roles.
2. **Namespace Normalization:** Strip package, plugin, or vendor namespaces (e.g. `amiga-ia:ami-cleanroom-builder` -> `ami-cleanroom-builder`) before role evaluation.
3. **Main Loop Exemption:** If no calling subagent is detected (`agentId === null`), the event originates from the human developer in the main interactive loop and MUST NOT be blocked.

```typescript
const CLEANROOM_BUILDERS = new Set([
  'ami-cleanroom-builder',
  'code-implementer-jr',
])

const CLEANROOM_TESTERS = new Set([
  'ami-cleanroom-tester',
  'test-writer-jr',
])

export function stripNamespace(role: string): string {
  const parts = role.split(/[:/]/)
  return parts[parts.length - 1].toLowerCase()
}

export function evaluateCleanroomPermission(
  agentRole: string | undefined,
  targetPath: string,
  toolName: string
): { allow: boolean; reason?: string } {
  // Main interactive loop is never gated
  if (!agentRole) return { allow: true }

  const normalizedRole = stripNamespace(agentRole)

  if (CLEANROOM_BUILDERS.has(normalizedRole)) {
    if (isTestPath(targetPath)) {
      return {
        allow: false,
        reason: `[Cleanroom Guard] Implementer agent '${agentRole}' cannot read or modify test file '${targetPath}'.`,
      }
    }
  }

  if (CLEANROOM_TESTERS.has(normalizedRole)) {
    if (isProductionSourcePath(targetPath)) {
      return {
        allow: false,
        reason: `[Cleanroom Guard] Test author agent '${agentRole}' cannot inspect uncommitted source file '${targetPath}'.`,
      }
    }
  }

  return { allow: true }
}
```

### Key Takeaways
- Never match agent roles using permissive substrings or unanchored regular expressions.
- Always strip vendor namespaces before comparing role names.
- Ensure the main human interactive loop is explicitly bypassed.
