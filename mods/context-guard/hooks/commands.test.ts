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

const HARDENED = [
  ...PROFILES,
  { path: 'C:/generic/repos/x', expectedGhUser: 'personal-dev', label: 'X', disallowCommits: true },
]
const CFG = { profiles: HARDENED }
const OUTSIDE = 'C:\\elsewhere\\none'
const deny = (command: string, cwd = PERSONAL) => denyCommand(command, cwd, CFG)

// B1
test('B1: git.exe, quoted full path, call operator and case are treated as git', () => {
  expect(deny('git.exe commit -m x')).toContain('commits')
  expect(deny('"C:\\Program Files\\Git\\cmd\\git.exe" commit')).toContain('commits')
  expect(deny('C:\\Git\\cmd\\git.exe commit')).toContain('commits')
  expect(deny('/usr/bin/git commit -m x')).toContain('commits')
  expect(deny('& git commit -m x')).toContain('commits')
  expect(deny('& "C:\\Program Files\\Git\\cmd\\git.exe" commit')).toContain('commits')
  expect(deny('GIT.EXE commit')).toContain('commits')
})

// B2
test('B2: full-path and call-operator kubectl without --context is denied', () => {
  expect(deny('C:\\tools\\kubectl.exe get pods', WORK)).toContain('kubectl without --context')
  expect(deny('"C:\\tools\\kubectl.exe" get pods', WORK)).toContain('kubectl without --context')
  expect(deny('& kubectl get pods', WORK)).toContain('kubectl without --context')
  expect(deny('/usr/local/bin/kubectl get pods', WORK)).toContain('kubectl without --context')
  expect(deny('KUBECTL.EXE get pods', WORK)).toContain('kubectl without --context')
})

// B3
test('B3: cmd /c and cmd.exe /c evaluate the rest as the command', () => {
  expect(deny('cmd /c kubectl get pods', WORK)).toContain('kubectl without --context')
  expect(deny('cmd.exe /c git commit')).toContain('commits')
  expect(deny('CMD.EXE /C git commit')).toContain('commits')
  expect(deny('cmd /c kubectl --context qa get pods', WORK)).toBeUndefined()
  expect(deny('cmd /c git status')).toBeUndefined()
})

// B4
test('B4: merge, cherry-pick, revert, rebase and am are denied in a guarded dir', () => {
  for (const c of ['git merge feature', 'git cherry-pick abc', 'git revert abc', 'git rebase main', 'git am x.patch']) {
    expect(deny(c)).toContain('commits')
  }
  expect(deny('git merge feature', WORK)).toBeUndefined()
})

// B5
test('B5: merge --ff-only and abort/quit/skip control forms are allowed', () => {
  expect(deny('git merge --ff-only origin/main')).toBeUndefined()
  expect(deny('git rebase --abort')).toBeUndefined()
  expect(deny('git cherry-pick --skip')).toBeUndefined()
  expect(deny('git merge --quit')).toBeUndefined()
  expect(deny('git merge --abort')).toBeUndefined()
  expect(deny('git revert --quit')).toBeUndefined()
  expect(deny('git am --abort')).toBeUndefined()
  expect(deny('git rebase --skip')).toBeUndefined()
  expect(deny('git rebase main')).toContain('commits')
})

// B6
test('B6: previously denied operations stay denied with their wording, only in a guarded dir', () => {
  expect(deny('git commit -m x')).toContain('commits')
  expect(deny('git checkout -b a')).toContain('branches')
  expect(deny('git checkout -B a')).toContain('branches')
  expect(deny('git switch -c a')).toContain('branches')
  expect(deny('git switch -C a')).toContain('branches')
  expect(deny('git switch --create a')).toContain('branches')
  expect(deny('git branch a')).toContain('branches')
  expect(deny('git branch -f a')).toContain('branches')
  expect(deny('git branch -c old new')).toContain('branches')
  expect(deny('git worktree add ../w')).toContain('worktrees')
  expect(deny('git commit -m x', WORK)).toBeUndefined()
  expect(deny('git worktree add ../w', OUTSIDE)).toBeUndefined()
})

// B7
test('B7: previously allowed commands stay allowed', () => {
  for (const c of ['git status', 'git log', 'git diff', 'git fetch', 'git pull --ff-only', 'git --help']) {
    expect(deny(c)).toBeUndefined()
  }
  expect(deny('git merge feature', OUTSIDE)).toBeUndefined()
  expect(deny('git commit -m x', OUTSIDE)).toBeUndefined()
  expect(deny('kubectl.exe --context qa get pods', WORK)).toBeUndefined()
  expect(deny('kubectl get pods --context=qa', WORK)).toBeUndefined()
  for (const s of ['config view', 'version', 'help', 'completion bash', 'plugin list']) {
    expect(deny(`kubectl ${s}`, WORK)).toBeUndefined()
  }
  expect(deny('kubectl -h', WORK)).toBeUndefined()
})

test('B7: empty and whitespace commands return undefined', () => {
  expect(deny('')).toBeUndefined()
  expect(deny('   ')).toBeUndefined()
})

test('B1/B2: lookalike programs are not git or kubectl', () => {
  expect(deny('gitk')).toBeUndefined()
  expect(deny('mygit commit')).toBeUndefined()
  expect(deny('kubectl-foo get', WORK)).toBeUndefined()
  expect(deny('git-lfs commit')).toBeUndefined()
})

// B8
test('B8: global git options are skipped before the subcommand', () => {
  expect(deny('git -c user.name=x commit')).toContain('commits')
  expect(deny('git --no-pager merge x')).toContain('commits')
  expect(deny('git --no-pager status')).toBeUndefined()
  expect(deny('git -c k=v log')).toBeUndefined()
})

test('B8: -C <abs path> sets the directory matched against profiles', () => {
  expect(deny('git -C C:\\generic\\repos\\x merge y', OUTSIDE)).toContain('commits')
  expect(deny('git -C C:\\generic\\repos\\x commit -m m', OUTSIDE)).toContain('commits')
  expect(deny('git -C C:\\elsewhere\\none merge y', PERSONAL)).toBeUndefined()
})

test('B8/B1: preceding cd or Set-Location segment sets the matched directory', () => {
  expect(deny('cd C:\\generic\\repos\\x; git.exe commit', OUTSIDE)).toContain('commits')
  expect(deny('Set-Location C:\\generic\\repos\\x; git commit', OUTSIDE)).toContain('commits')
  expect(deny('cd C:\\elsewhere\\none; git commit', PERSONAL)).toBeUndefined()
})

test('cmd /c unwraps quoted chained commands before evaluating segments', () => {
  expect(deny('cmd /c "git status && git commit -m x"')).toContain('commits')
  expect(deny('cmd.exe /c "cd C:\\personal\\code\\repo && git commit -m x"', OUTSIDE)).toContain('commits')
  expect(deny('cmd /c "git status && git diff"')).toBeUndefined()
})

const KUBE = 'kubectl without --context'

test('Q1: separator inside single quotes does not start a new segment', () => {
  for (const sep of [';', '|', '&&', '||']) {
    expect(deny(`echo 'a${sep} kubectl get pods'`, WORK)).toBeUndefined()
  }
})

test('Q2: separator inside double quotes does not start a new segment', () => {
  for (const sep of [';', '|', '&&', '||']) {
    expect(deny(`echo "x ${sep} kubectl get pods"`, WORK)).toBeUndefined()
  }
})

test('Q3: unquoted separator followed by bare kubectl is denied', () => {
  expect(deny('echo hi; kubectl get pods', WORK)).toContain(KUBE)
  expect(deny('echo hi | kubectl get pods', WORK)).toContain(KUBE)
  expect(deny('echo hi && kubectl get pods', WORK)).toContain(KUBE)
  expect(deny('echo hi || kubectl get pods', WORK)).toContain(KUBE)
})

test('Q4: unquoted separator followed by kubectl with --context is allowed', () => {
  expect(deny('echo hi; kubectl --context prod get pods', WORK)).toBeUndefined()
})

test('Q5: quote awareness does not weaken git rules', () => {
  expect(deny('echo "a; b" && git commit -m x')).toContain('commits')
  expect(deny("echo 'a | b'; git commit -m x")).toContain('commits')
})

test('Q6: bash: backslash-escaped double quote does not close a double-quoted string', () => {
  expect(denyCommand('echo "a \\" ; kubectl get pods"', WORK, CFG, 'bash')).toBeUndefined()
})

test('Q7: powershell: backtick-escaped double quote does not close a double-quoted string', () => {
  expect(denyCommand('echo "a `" ; kubectl get pods"', WORK, CFG, 'powershell')).toBeUndefined()
})

test('B9: powershell: backslash is not an escape, a quoted path ending in backslash closes normally', () => {
  expect(denyCommand('cd "C:\\dir\\"; kubectl get pods', WORK, CFG, 'powershell')).toContain(KUBE)
})

test('B10: shell omitted: neither backslash nor backtick escapes (fail closed)', () => {
  expect(denyCommand('echo "a \\" ; kubectl get pods"', WORK, CFG)).toContain(KUBE)
  expect(denyCommand('echo "a `" ; kubectl get pods"', WORK, CFG)).toContain(KUBE)
})

test('Q8: doubled single quote stays inside a single-quoted string', () => {
  expect(deny("echo 'it''s; kubectl get pods'", WORK)).toBeUndefined()
})

test('Q edge: unbalanced quote yields undefined', () => {
  expect(deny("echo 'abc; kubectl get pods", WORK)).toBeUndefined()
})

test('Q edge: backslash is literal inside single quotes', () => {
  expect(deny("echo 'a\\'; kubectl get pods", WORK)).toContain(KUBE)
})

test('Q edge: separator glued to a closing quote is still a separator', () => {
  expect(deny('echo "a";kubectl get pods', WORK)).toContain(KUBE)
})
