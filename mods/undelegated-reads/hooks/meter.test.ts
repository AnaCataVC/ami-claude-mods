import { expect, test } from 'claude-code/testing'
import { THRESHOLD, bandColor, bandText, denyMessage, levelOf, meteredTool, statusText, step } from './meter'

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

test('levels follow the count: hidden at 0, warn from threshold-3, cut right before the block', () => {
  expect(levelOf(0)).toBe('none')
  expect(levelOf(6)).toBe('quiet')
  expect(levelOf(7)).toBe('warn')
  expect(levelOf(8)).toBe('warn')
  expect(levelOf(9)).toBe('cut')
})

test('status line shows a gauge with the count while above 0 and hides at 0', () => {
  expect(statusText(0)).toBeUndefined()
  expect(statusText(4)).toBe('undelegated reads ▰▰▰▰▱▱▱▱▱▱ 4/10')
  expect(statusText(THRESHOLD - 1)).toBe('undelegated reads ▰▰▰▰▰▰▰▰▰▱ 9/10')
})

test('the band appears from 7, yellow, and red at the cut', () => {
  expect(bandText(6)).toBeUndefined()
  expect(bandText(7)).toBe('7 of 10 consecutive mechanical reads: consider delegating further exploration to a subagent')
  expect(bandColor(7)).toBe('yellow')
  expect(bandColor(9)).toBe('red')
  expect(bandText(9)).toContain('blocked')
})

test('searching shell commands count as a Grep, other shell commands do not', () => {
  expect(meteredTool('PowerShell', 'Get-ChildItem C:\\repo -Recurse -Filter *.py')).toBe('Grep')
  expect(meteredTool('Bash', 'grep -rn foo src')).toBe('Grep')
  expect(meteredTool('Bash', 'find . -name "*.ts"')).toBe('Grep')
  expect(meteredTool('Bash', 'git status')).toBe('Bash')
  expect(meteredTool('Bash', 'cat README.md')).toBe('Bash')
  expect(meteredTool('Read', undefined)).toBe('Read')
})
