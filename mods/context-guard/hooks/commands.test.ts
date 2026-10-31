import { expect, test } from 'claude-code/testing'
import { denyCommand } from './commands'

const PROFILES = [
  { path: 'C:/work/projects', expectedGhUser: 'work-dev', label: 'Work' },
  { path: 'C:/personal/code', expectedGhUser: 'personal-dev', label: 'Personal', disallowCommits: true },
]

const WORK = 'C:\\work\\projects\\api'
const PERSONAL = 'C:\\personal\\code\\repo'

test('bare kubectl commands without --context are denied', () => {
  expect(denyCommand('kubectl get pods', WORK, { profiles: PROFILES })).toBeDefined()
  expect(denyCommand('kubectl -n prod get pods', WORK, { profiles: PROFILES })).toBeDefined()
  expect(denyCommand('kubectl.exe apply -f x.yaml', WORK, { profiles: PROFILES })).toBeDefined()
  expect(denyCommand('kubectl --context cluster-a get pods', WORK, { profiles: PROFILES })).toBeUndefined()
  expect(denyCommand('kubectl get pods --context=cluster-a', WORK, { profiles: PROFILES })).toBeUndefined()
  expect(denyCommand('kubectl config current-context', WORK, { profiles: PROFILES })).toBeUndefined()
  expect(denyCommand('kubectl --help', WORK, { profiles: PROFILES })).toBeUndefined()
})

test('git commit and branch creations are denied when profile specifies disallowCommits', () => {
  expect(denyCommand('git commit -m "feat: new"', PERSONAL, { profiles: PROFILES })).toBeDefined()
  expect(denyCommand('git checkout -b feat/new', PERSONAL, { profiles: PROFILES })).toBeDefined()
  expect(denyCommand('git branch feat/new', PERSONAL, { profiles: PROFILES })).toBeDefined()
  expect(denyCommand('git commit -m "feat: work"', WORK, { profiles: PROFILES })).toBeUndefined()
  expect(denyCommand('git status', PERSONAL, { profiles: PROFILES })).toBeUndefined()
  expect(denyCommand('git diff', PERSONAL, { profiles: PROFILES })).toBeUndefined()
})
