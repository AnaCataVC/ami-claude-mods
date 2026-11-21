import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const positionals = args.filter(a => !a.startsWith('--'))
const bump = positionals[0]
const dryRun = flags.has('--dry-run')
const noPush = flags.has('--no-push')

function printUsage() {
  console.error('Usage: npm run release -- <patch|minor> [--dry-run] [--no-push]')
}

if (!bump || positionals.length > 1) {
  printUsage()
  process.exit(1)
}

if (bump === 'major') {
  console.error('Major bumps are disabled: this repository stays on 0.x (see docs/versioning-policy.md).')
  process.exit(1)
}

if (bump !== 'patch' && bump !== 'minor') {
  console.error(`Invalid release bump "${bump}". Expected "patch" or "minor".`)
  printUsage()
  process.exit(1)
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: options.shell ?? false,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
  return result
}

function nextVersion(current, level) {
  const parts = current.split('.').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    console.error(`Unsupported version format in package.json: ${current}`)
    process.exit(1)
  }
  const [major, minor, patch] = parts
  return level === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`
}

const status = run('git', ['status', '--porcelain'], { capture: true })
if (status.stdout.trim().length > 0) {
  console.error('Working tree is not clean. Commit or stash your changes before releasing.')
  process.exit(1)
}

const branch = run('git', ['branch', '--show-current'], { capture: true }).stdout.trim()
if (branch !== 'main') {
  console.error(`Releases must be cut from "main" (current branch: "${branch}").`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
const targetVersion = nextVersion(pkg.version, bump)

console.log(`Preparing release v${targetVersion} (from v${pkg.version})...`)
console.log('\n==> Running validation...')
run('npm', ['run', 'validate'], { shell: true })

console.log('\n==> Running tests...')
run('npm', ['test'], { shell: true })

if (dryRun) {
  console.log(`\n[dry-run] Would run: npm version ${bump} -m "chore(release): bump version to v%s"`)
  if (!noPush) {
    console.log('[dry-run] Would run: git push --follow-tags')
  }
  process.exit(0)
}

console.log(`\n==> Bumping version to v${targetVersion}...`)
run('npm', ['version', bump, '-m', 'chore(release): bump version to v%s'], { shell: true })

if (!noPush) {
  console.log('\n==> Pushing commit and tag to origin...')
  run('git', ['push', '--follow-tags'])
  console.log(`\nRelease v${targetVersion} pushed! GitHub Actions will publish the release assets.`)
} else {
  console.log(`\nRelease v${targetVersion} committed and tagged locally (--no-push).`)
}
