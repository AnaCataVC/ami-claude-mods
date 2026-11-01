import { readdirSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
const version = packageJson.version || '1.0.0'

const modsDir = join(process.cwd(), 'mods')
const releasesDir = join(process.cwd(), 'releases')

if (!existsSync(releasesDir)) {
  mkdirSync(releasesDir, { recursive: true })
}

const mods = readdirSync(modsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

console.log(`Packaging ${mods.length} Claude Code mods (v${version}) into releases/...\n`)

for (const mod of mods) {
  const modSource = join(modsDir, mod)
  const zipName = `${mod}-v${version}.zip`
  const zipPath = join(releasesDir, zipName)

  console.log(`- Packaging [${mod}] -> ${zipName}`)
  const result = spawnSync('tar', ['-a', '-cf', zipPath, '-C', modSource, '.'], {
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    console.error(`Failed to package ${mod}`)
    process.exit(1)
  }
}

// Package unified bundle
const bundleName = `ami-claude-mods-all-v${version}.zip`
const bundlePath = join(releasesDir, bundleName)
console.log(`- Packaging unified bundle -> ${bundleName}`)
const bundleResult = spawnSync('tar', ['-a', '-cf', bundlePath, '-C', process.cwd(), 'mods'], {
  stdio: 'inherit',
})

if (bundleResult.status !== 0) {
  console.error('Failed to package unified bundle')
  process.exit(1)
}

console.log(`\nSuccessfully generated ${mods.length + 1} release archives in releases/`)
