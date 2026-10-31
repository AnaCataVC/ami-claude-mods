import { expect, test } from 'claude-code/testing'
import { emptyTracked } from './checklist'
import { collectDocker, collectGit } from './collect'
import type { RunOutcome, Runner } from './collect'

function fakeRunner(answers: Record<string, RunOutcome>) {
  const calls: string[] = []
  const run: Runner = async argv => {
    const line = argv.join(' ')
    calls.push(line)
    return answers[line] ?? { status: 'error' }
  }
  return { run, calls }
}

const ok = (stdout: string): RunOutcome => ({ status: 'ok', stdout })
const PS = 'docker ps --format {{.Names}}\t{{.Image}}'
const VOLUMES = 'docker volume ls --format {{.Name}}'
const GIT = 'git status --porcelain=v1 --branch'

test('git costs one process and reads branch, changes and unpublished commits from it', async () => {
  const { run, calls } = fakeRunner({ [GIT]: ok('## main...origin/main [ahead 1]\n M a\n') })
  expect(await collectGit(run, 'C:\\workspace\\repo')).toEqual({ branch: 'main', changes: 1, unpushed: 1 })
  expect(calls).toEqual([GIT])
})

test('git outside a repository or unable to answer yields no section', async () => {
  expect(await collectGit(fakeRunner({ [GIT]: { status: 'failed' } }).run, 'C:\\x')).toBeNull()
  expect(await collectGit(fakeRunner({}).run, 'C:\\x')).toBeNull()
})

test('docker costs no process when nothing was tracked', async () => {
  const { run, calls } = fakeRunner({})
  expect(await collectDocker(run, emptyTracked())).toBeNull()
  expect(calls).toEqual([])
})

test('a daemon error reads as down, but a timeout reads as unknown', async () => {
  const state = { ...emptyTracked(), containers: [{ name: 'pg' }] }
  expect(await collectDocker(fakeRunner({ [PS]: { status: 'failed' } }).run, state)).toEqual({ status: 'down' })
  expect(await collectDocker(fakeRunner({ [PS]: { status: 'error' } }).run, state)).toEqual({ status: 'unknown' })
})

test('tracked containers and volumes are matched against what docker reports', async () => {
  const state = { ...emptyTracked(), containers: [{ name: 'pg' }], volumes: ['pgdata', 'gone'] }
  const { run } = fakeRunner({ [PS]: ok('pg\tpostgres\nother\tredis'), [VOLUMES]: ok('pgdata\nunrelated') })
  expect(await collectDocker(run, state)).toEqual({ status: 'up', containers: ['pg'], composes: [], volumes: ['pgdata'], unverified: [] })
})

test('a failed volume listing leaves the volumes unverified instead of gone', async () => {
  const state = { ...emptyTracked(), volumes: ['pgdata'] }
  const { run } = fakeRunner({ [PS]: ok(''), [VOLUMES]: { status: 'error' } })
  expect(await collectDocker(run, state)).toMatchObject({ status: 'up', volumes: [], unverified: ['volume pgdata'] })
})

test('legacy compose runs docker-compose in its directory; a failed ps stays unverified', async () => {
  const legacy = { legacy: true, files: ['a.yml'], project: 'old', dir: 'C:/stack' }
  const modern = { legacy: false, files: [], project: undefined, dir: 'C:/other' }
  const state = { ...emptyTracked(), composes: [legacy, modern] }
  const { run } = fakeRunner({
    [PS]: ok(''),
    'docker-compose -f a.yml -p old ps -q': ok('c1'),
    'docker compose ps -q': { status: 'error' },
  })
  expect(await collectDocker(run, state)).toEqual({
    status: 'up',
    containers: [],
    composes: ['old'],
    volumes: [],
    unverified: ['compose project C:/other'],
  })
})
