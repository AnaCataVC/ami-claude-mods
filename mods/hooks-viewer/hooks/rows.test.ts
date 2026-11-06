import { expect, test } from 'claude-code/testing'

import { canBlock, limitRows, matcherChips, modDirs, parseMod, shortCommand, sortEvents, toRows } from './rows'

test('settings.hooks flattens into one row per hook, exec-form args included', () => {
  const hooks = {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'pwsh', args: ['-File', 'C:/h/guard.ps1'], timeout: 5 }] },
      { hooks: [{ type: 'command', command: 'echo hi' }] },
    ],
  }
  expect(toRows(hooks, 'user')).toEqual([
    { event: 'PreToolUse', source: 'user', matcher: 'Bash', command: 'pwsh -File C:/h/guard.ps1', timeout: 5 },
    { event: 'PreToolUse', source: 'user', matcher: '*', command: 'echo hi', timeout: undefined },
  ])
  expect(toRows(undefined, 'user')).toEqual([])
})

test('the script name replaces the whole command line; inline commands stay', () => {
  expect(shortCommand('pwsh -NoProfile -File "C:\\h\\guard.ps1" -x 1')).toBe('guard.ps1')
  expect(shortCommand('python C:/h/check.py arg')).toBe('check.py')
  expect(shortCommand('echo hi')).toBe('echo hi')
})

test('rows beyond the room are counted, never hidden silently, and one row always shows', () => {
  const list = [1, 2, 3].map(n => ({ event: 'E', source: 'user', matcher: '*', command: `c${n}` }))
  expect(limitRows(list, 2)).toEqual({ shown: list.slice(0, 2), hidden: 1 })
  expect(limitRows(list, 0).shown.length).toBe(1)
})

test('plugin dirs split on semicolons and manifests without a name are not mods', () => {
  expect(modDirs('C:\\a; C:\\b;;')).toEqual(['C:\\a', 'C:\\b'])
  expect(modDirs(undefined)).toEqual([])
  expect(parseMod('{ "name": "m", "version": "1.2.0", "description": "d" }')).toEqual({ name: 'm', version: '1.2.0', description: 'd' })
  expect(parseMod('{ "name": "m" }')).toEqual({ name: 'm', version: '?', description: '' })
  expect(parseMod('{ "version": "1" }')).toBeUndefined()
  expect(parseMod('not json')).toBeUndefined()
})

test('events sort by lifecycle and matchers collapse into short chips', () => {
  expect(sortEvents(['SubagentStop', 'Custom', 'PreToolUse', 'SessionStart'])).toEqual(['SessionStart', 'PreToolUse', 'SubagentStop', 'Custom'])
  expect(matcherChips('Bash|PowerShell|Agent|Task')).toEqual(['Bash', 'PowerShell', 'Agent', '+1'])
  expect(matcherChips('mcp__.*__slack_send_message(_draft)?')).toEqual(['mcp:slack_send_message[_draft]'])
  expect(canBlock('PreToolUse')).toBe(true)
  expect(canBlock('PostToolUse')).toBe(false)
})
