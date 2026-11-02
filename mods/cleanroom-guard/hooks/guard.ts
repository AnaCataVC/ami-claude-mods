// Double-Blind Cleanroom isolation logic: enforces strict separation between
// implementation workers and test-authoring workers.

export const IMPLEMENTER = 'code-implementer-jr'
export const TEST_WRITER = 'test-writer-jr'
export const AMI_BUILDER = 'ami-cleanroom-builder'
export const AMI_TESTER = 'ami-cleanroom-tester'

const IMPLEMENTER_ROLES = new Set([
  'code-implementer-jr',
  'ami-cleanroom-builder',
  'cleanroom-builder',
  'code-implementer',
])

const TEST_WRITER_ROLES = new Set([
  'test-writer-jr',
  'ami-cleanroom-tester',
  'cleanroom-tester',
  'test-writer',
])

function stripNamespace(agentType: string): string {
  return agentType.includes('/') ? agentType.split('/').pop()! : agentType
}

export function isImplementerRole(agentType: string | undefined): boolean {
  if (!agentType) return false
  const bare = stripNamespace(agentType).toLowerCase()
  return IMPLEMENTER_ROLES.has(bare)
}

export function isTestWriterRole(agentType: string | undefined): boolean {
  if (!agentType) return false
  const bare = stripNamespace(agentType).toLowerCase()
  return TEST_WRITER_ROLES.has(bare)
}

// Paths normalized to forward slashes before matching.
const TEST_PATH = /(^|\/)(tests?|__tests__|spec)(\/|$)|(^|\/)test_[^\/]*$|_test\.[^\/]+$|\.(test|spec)\.[^\/]+$|(^|\/)conftest\.py$/i
const SOURCE_FILE = /\.(py|pyi|ts|tsx|js|jsx|mjs|cjs|go|rs|java|kt|rb|cs|php|sql|sqlx|ps1|sh|c|cc|cpp|h|hpp|swift|scala|vue|svelte)$/i

// Shell readers whose arguments expose file content, plus copiers and inline interpreters that can read as a side effect.
const SHELL_READ = /\b(cat|type|head|tail|less|more|bat|gc|Get-Content|sed|awk|grep|rg|Select-String|cp|copy|Copy-Item|mv|Move-Item)\b|\b(python3?|py|node|deno|bun|perl|ruby|php)\s+-[cepE]\b/i
// Git readers that print file content from a revision or from uncommitted changes.
const GIT_CONTENT = /\bgit\s+(show|diff|log|blame|cat-file|stash\s+show)\b/i
// `git show REV:path` is the sanctioned base-version read of the test writer; a diff or a patch log
// would expose the production changes the implementer is writing in parallel.
const GIT_BASE_READ = /\bgit\s+show\s+\S+/g
const GIT_UNCOMMITTED_READ = /\bgit\s+(diff|stash\s+show)\b|\bgit\s+log\b[^;|&\n]*\s(-p|--patch)\b/i

const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

export type Call = { tool: string; input: Record<string, unknown> }

const normalize = (path: string): string => path.split(String.fromCharCode(92)).join('/')
export const isTestPath = (path: string): boolean => TEST_PATH.test(normalize(path))
const isProductionSource = (path: string): boolean => SOURCE_FILE.test(path) && !isTestPath(path)

function pathsOf(call: Call): string[] {
  const { input } = call
  if (call.tool === 'Read' || call.tool === 'Edit' || call.tool === 'Write') return [String(input.file_path ?? '')]
  if (call.tool === 'NotebookEdit') return [String(input.notebook_path ?? '')]
  if (call.tool === 'Grep') return [input.path, input.glob].filter((v): v is string => typeof v === 'string')
  if (call.tool === 'Glob') return [input.pattern, input.path].filter((v): v is string => typeof v === 'string')
  return []
}

const TOKEN_SEPARATORS = /[\s;|&<>"'():]+/

function shellTokens(command: string, agentType: string): string[] {
  const readsContent = SHELL_READ.test(command) || GIT_CONTENT.test(command)
  if (!readsContent) return []
  // The implementer gets no `git show` exemption: a committed test is still a test.
  const visible = isTestWriterRole(agentType) ? command.replace(GIT_BASE_READ, ' ') : command
  return visible.split(TOKEN_SEPARATORS).filter(Boolean)
}

type Violation = { reason: string; target: string }

function violationOf(agentType: string | undefined, call: Call): Violation | undefined {
  const isImpl = isImplementerRole(agentType)
  const isTest = isTestWriterRole(agentType)
  if (!isImpl && !isTest) return undefined

  const isShell = call.tool === 'Bash' || call.tool === 'PowerShell'
  const command = String(call.input.command ?? '')
  const candidates = isShell ? shellTokens(command, agentType!) : pathsOf(call)
  const verb = WRITE_TOOLS.has(call.tool) ? 'edit/write' : 'read'

  if (isImpl) {
    const hit = candidates.find(isTestPath)
    return hit && { target: hit, reason: `cleanroom: ${agentType} cannot ${verb} tests (${hit}). Work strictly from the interface contract.` }
  }

  // The test writer may write only test paths, whatever the extension.
  if (WRITE_TOOLS.has(call.tool)) {
    const outside = candidates.find(path => path && !isTestPath(path))
    return outside && { target: outside, reason: `cleanroom: ${agentType} may only write tests (${outside}).` }
  }
  if (isShell && GIT_UNCOMMITTED_READ.test(command)) {
    return {
      target: 'diff del working tree',
      reason: `cleanroom: ${agentType} cannot inspect working tree diffs (exposes implementation). Use \`git show HEAD:<path>\` or the contract.`,
    }
  }
  // Only files are blocked for reads: directory-wide Grep/Glob stay open to locate tests.
  const hit = candidates.find(isProductionSource)
  return hit && { target: hit, reason: `cleanroom: ${agentType} cannot ${verb} working tree production code (${hit}). Use \`git show HEAD:<path>\` or the contract.` }
}

// Deny reason sent to the model (English, with the full path and the way out).
export function denyReason(agentType: string | undefined, call: Call): string | undefined {
  return violationOf(agentType, call)?.reason
}

// Short Spanish one-liner for the user's toast; shows only the basename.
export function toastText(agentType: string | undefined, call: Call): string | undefined {
  const violation = violationOf(agentType, call)
  if (!violation) return undefined
  const action = WRITE_TOOLS.has(call.tool) ? 'escribir' : 'leer'
  const name = normalize(violation.target).split('/').filter(Boolean).pop() ?? violation.target
  return `cleanroom: bloqueé a ${agentType} ${action} ${name}`
}
