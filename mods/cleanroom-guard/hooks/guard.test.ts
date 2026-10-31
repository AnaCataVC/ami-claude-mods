import { expect, test } from 'claude-code/testing'

import { AMI_BUILDER, AMI_TESTER, IMPLEMENTER, TEST_WRITER, denyReason } from './guard'

type Case = [agent: string | undefined, tool: string, input: Record<string, unknown>, denied: boolean]

const cases: Case[] = [
  [IMPLEMENTER, 'Read', { file_path: 'C:/repo/tests/test_api.py' }, true],
  [AMI_BUILDER, 'Read', { file_path: 'C:/repo/tests/test_api.py' }, true],
  [IMPLEMENTER, 'Read', { file_path: 'src/app/widget.test.tsx' }, true],
  [IMPLEMENTER, 'Read', { file_path: 'pkg/thing_test.go' }, true],
  [IMPLEMENTER, 'Read', { file_path: 'web/a.spec.ts' }, true],
  [IMPLEMENTER, 'Grep', { pattern: 'foo', path: 'tests' }, true],
  [IMPLEMENTER, 'Glob', { pattern: '**/test_*.py' }, true],
  [IMPLEMENTER, 'Bash', { command: 'cat tests/test_api.py' }, true],
  [IMPLEMENTER, 'Read', { file_path: 'src/app/api.py' }, false],
  [IMPLEMENTER, 'Bash', { command: 'git status --short' }, false],
  [TEST_WRITER, 'Read', { file_path: 'src/app/api.py' }, true],
  [AMI_TESTER, 'Read', { file_path: 'src/app/api.py' }, true],
  [TEST_WRITER, 'Bash', { command: 'cat src/app/api.py' }, true],
  [TEST_WRITER, 'Bash', { command: 'git show HEAD:src/app/api.py' }, false],
  [TEST_WRITER, 'Read', { file_path: 'tests/test_api.py' }, false],
  [TEST_WRITER, 'Read', { file_path: 'README.md' }, false],
  [TEST_WRITER, 'Grep', { pattern: 'def foo', path: 'tests' }, false],
  [IMPLEMENTER, 'Edit', { file_path: 'tests/test_api.py' }, true],
  [IMPLEMENTER, 'Edit', { file_path: 'src/app/api.py' }, false],
  [TEST_WRITER, 'Write', { file_path: 'src/app/api.py' }, true],
  [TEST_WRITER, 'Write', { file_path: 'tests/test_api.py' }, false],
  [TEST_WRITER, 'Write', { file_path: 'README.md' }, true],
  [TEST_WRITER, 'Edit', { file_path: 'config/settings.json' }, true],
  [IMPLEMENTER, 'Read', { file_path: 'src/inspect.py' }, false],
  [IMPLEMENTER, 'Read', { file_path: 'src/aspect.ts' }, false],
  [IMPLEMENTER, 'Edit', { file_path: 'lib/latest.js' }, false],
  [IMPLEMENTER, 'Read', { file_path: 'src/foo_testing.py' }, false],
  [TEST_WRITER, 'Write', { file_path: 'src/inspect.py' }, true],
  [IMPLEMENTER, 'Bash', { command: 'git show HEAD:tests/test_api.py' }, true],
  [IMPLEMENTER, 'Bash', { command: 'git show HEAD:src/app/api.py' }, false],
  [IMPLEMENTER, 'Bash', { command: 'git diff -- tests/test_api.py' }, true],
  [IMPLEMENTER, 'Bash', { command: 'python -c "print(open(\'tests/test_api.py\').read())"' }, true],
  [IMPLEMENTER, 'PowerShell', { command: 'Copy-Item tests/test_api.py out.txt' }, true],
  [TEST_WRITER, 'Bash', { command: 'git diff' }, true],
  [TEST_WRITER, 'Bash', { command: 'git log -p -1' }, true],
  [TEST_WRITER, 'Bash', { command: 'git log --oneline' }, false],
  [TEST_WRITER, 'Bash', { command: 'python -c "print(open(\'src/app/api.py\').read())"' }, true],
  [TEST_WRITER, 'Bash', { command: 'python -m pytest tests/test_api.py' }, false],
  ['Explore', 'Edit', { file_path: 'tests/test_api.py' }, false],
  ['Explore', 'Read', { file_path: 'tests/test_api.py' }, false],
  [undefined, 'Read', { file_path: 'tests/test_api.py' }, false],
]

test('cleanroom decision table', async () => {
  for (const [agent, tool, input, denied] of cases) {
    const reason = denyReason(agent, { tool, input })
    expect([agent, tool, JSON.stringify(input), reason !== undefined]).toEqual([agent, tool, JSON.stringify(input), denied])
  }
})
