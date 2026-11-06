import { expect, test } from 'claude-code/testing'

import { langFrom, messages } from './messages'

test('only an exact es (trimmed, any case) selects Spanish', () => {
  expect(langFrom('es')).toBe('es')
  expect(langFrom(' ES ')).toBe('es')
  expect(langFrom('Es')).toBe('es')
})

test('unset, empty and any other value select English without throwing', () => {
  for (const raw of [undefined, null, '', '   ', 'en', 'es-CL', 'spanish', 'ES_', 'fr']) {
    expect(langFrom(raw)).toBe('en')
  }
})

test('both languages define the same entries, function entries included', () => {
  const english = messages.en as Record<string, unknown>
  const spanish = messages.es as Record<string, unknown>
  expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort())
  for (const key of Object.keys(english)) expect(typeof spanish[key]).toBe(typeof english[key])
})
