import { expect, test } from 'claude-code/testing'
import {
  accountLabel,
  findMatchingProfile,
  isAccountMismatch,
  isContextCommand,
  isProdContext,
  isUnder,
  kubeLabel,
  parseGhAccount,
  parseKubeContext,
  statusText,
  warnings,
} from './context'

const PROFILES = [
  { path: 'C:/work/projects', expectedGhUser: 'work-dev', label: 'Work' },
  { path: 'C:/personal/code', expectedGhUser: 'personal-dev', label: 'Personal', disallowCommits: true },
]

test('profile matching recognizes directories case-insensitively', () => {
  expect(findMatchingProfile('C:\\work\\projects\\api', PROFILES)?.label).toBe('Work')
  expect(findMatchingProfile('c:/personal/code/mine', PROFILES)?.label).toBe('Personal')
  expect(findMatchingProfile('C:\\other\\random', PROFILES)).toBeNull()
})

test('detects production cluster contexts case-insensitively', () => {
  expect(isProdContext('gke_x_PROD-cluster')).toBe(true)
  expect(isProdContext('staging-ctx')).toBe(false)
  expect(isProdContext('gke_x_nonprod-cluster')).toBe(false)
  expect(isProdContext('gke_x_product-cluster')).toBe(false)
  expect(isProdContext('gke_x_us_production')).toBe(true)
})

test('gh account parses active user at host block', () => {
  const hosts = [
    'github.com:',
    '    git_protocol: https',
    '    users:',
    '        work-dev:',
    '        personal-dev:',
    '    user: personal-dev',
    '',
  ].join('\n')
  expect(parseGhAccount(hosts)).toBe('personal-dev')
})

test('kube context parses current-context safely', () => {
  expect(parseKubeContext('apiVersion: v1\ncurrent-context: gke_prod_cluster\n')).toBe('gke_prod_cluster')
  expect(parseKubeContext("current-context: 'quoted-cluster'\n")).toBe('quoted-cluster')
  expect(parseKubeContext('apiVersion: v1\nkind: Config\n')).toBeNull()
})

test('detects context and credential change commands for reactive refresh', () => {
  expect(isContextCommand('gh auth switch -u test')).toBe(true)
  expect(isContextCommand('git push origin main')).toBe(true)
  expect(isContextCommand('git pull --rebase')).toBe(true)
  expect(isContextCommand('kubectl config use-context cluster-a')).toBe(true)
  expect(isContextCommand('git status')).toBe(false)
})

test('statusText formats account and kubernetes status clearly', () => {
  const snap = { gh: 'work-dev', kube: 'staging-ctx' }
  expect(statusText(snap, 'C:\\work\\projects\\app', { profiles: PROFILES })).toBe('GitHub: Work ✓ · kubectl: staging-ctx')
})

test('warnings report account mismatch and production kubernetes cluster', () => {
  const snap = { gh: 'other-user', kube: 'prod-cluster' }
  const found = warnings(snap, 'C:\\work\\projects\\app', { profiles: PROFILES, warnProductionKube: true })
  expect(found.length).toBe(2)
  expect(found[0]?.level).toBe('error')
  expect(found[1]?.level).toBe('warn')
})
