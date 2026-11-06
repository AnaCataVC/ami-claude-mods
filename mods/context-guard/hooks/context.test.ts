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
  expect(isProdContext('k8s-live-cluster')).toBe(true)
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

const STATUS_CONFIG = { profiles: [{ path: 'C:/work/projects', expectedGhUser: 'work-dev', label: 'Work', disallowCommits: true }] }
const MISMATCH = { gh: 'other-user', kube: 'prod-cluster' }

const NO_SNAPSHOT = { gh: undefined, kube: undefined } as never

test('statusText: mismatch and production alerts take priority and fit the row', () => {
  const text = statusText(MISMATCH, 'C:/work/projects/app', STATUS_CONFIG, 'es')
  expect(text).toBe('✕ other-user · ⚠ prod-cluster')
  expect(text.length).toBeLessThanOrEqual(32)
  expect(statusText(NO_SNAPSHOT, 'C:/elsewhere', undefined, 'es')).toBe('Sin cuenta GitHub')
})

test('statusText: matched account shows its label with a check, plain kube context follows', () => {
  const config = { profiles: [{ path: 'C:/work/projects', expectedGhUser: 'work-dev', label: 'Work' }] }
  expect(statusText({ gh: 'work-dev', kube: 'staging' }, 'C:/work/projects/app', config)).toBe('✓ Work · staging')
})

test('statusText: drops the least important part, then truncates, to stay within 32 characters', () => {
  const long = { gh: 'other-user', kube: 'gke_proj_us_very-long-production-cluster-name' }
  const text = statusText(long, 'C:/work/projects/app', STATUS_CONFIG)
  expect(text.length).toBeLessThanOrEqual(32)
  expect(text.startsWith('✕ other-user')).toBe(true)
})

test('statusText en is the default and carries no Spanish wording', () => {
  const noCommits = { gh: 'work-dev', kube: undefined } as never
  const text = statusText(noCommits, 'C:/work/projects/app', STATUS_CONFIG, 'en')
  expect(text).toBe('✓ Work · no direct commits')
  expect(statusText(noCommits, 'C:/work/projects/app', STATUS_CONFIG)).toBe(text)
  expect(statusText(noCommits, 'C:/work/projects/app', STATUS_CONFIG, 'es')).toBe('✓ Work · sin commits directos')
  expect(statusText(NO_SNAPSHOT, 'C:/elsewhere', undefined, 'en')).toBe('No GitHub account')
})
