import { expect, test } from 'claude-code/testing'
import { THRESHOLD, WARN_FROM, denyMessage, meteredTool, statusText, step } from './meter'

test('read-type tools add one, Agent and Task reset, other tools leave the count alone', () => {
  expect(step(3, 'Grep')).toEqual({ count: 4, blocked: false })
  expect(step(3, 'Glob')).toEqual({ count: 4, blocked: false })
  expect(step(3, 'Read')).toEqual({ count: 4, blocked: false })
  expect(step(3, 'Agent')).toEqual({ count: 0, blocked: false })
  expect(step(3, 'Task')).toEqual({ count: 0, blocked: false })
  expect(step(3, 'Bash')).toEqual({ count: 3, blocked: false })
})

test('the call that reaches the threshold is blocked and resets the count to 0', () => {
  expect(step(THRESHOLD - 2, 'Read')).toEqual({ count: THRESHOLD - 1, blocked: false })
  expect(step(THRESHOLD - 1, 'Read')).toEqual({ count: 0, blocked: true })
})

test('the deny message is one clean line carrying the count', () => {
  expect(denyMessage(10)).toBe('10 consecutive mechanical reads without delegating: dispatch to an exploration subagent or proceed (counter resets).')
  expect(denyMessage(10)).not.toContain('\n')
})

test('status line is cleared below WARN_FROM and shows the gauge from WARN_FROM on', () => {
  expect(WARN_FROM).toBe(7)
  expect(statusText(0)).toBeUndefined()
  expect(statusText(WARN_FROM - 1)).toBeUndefined()
  expect(statusText(WARN_FROM)).toBe('lecturas sin delegar ▰▰▰▰▰▰▰▱▱▱ 7/10')
  expect(statusText(THRESHOLD - 1)).toBe('lecturas sin delegar ▰▰▰▰▰▰▰▰▰▱ 9/10')
})

test('searching shell commands count as a Grep, other shell commands do not', () => {
  expect(meteredTool('PowerShell', 'Get-ChildItem C:\\repo -Recurse -Filter *.py')).toBe('Grep')
  expect(meteredTool('Bash', 'grep -rn foo src')).toBe('Grep')
  expect(meteredTool('Bash', 'find . -name "*.ts"')).toBe('Grep')
  expect(meteredTool('Bash', 'git status')).toBe('Bash')
  expect(meteredTool('Bash', 'cat README.md')).toBe('Bash')
  expect(meteredTool('Read', undefined)).toBe('Read')
})
