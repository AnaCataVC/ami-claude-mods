import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const modsDir = join(process.cwd(), 'mods')
const mods = readdirSync(modsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

console.log(`Validating ${mods.length} Claude Code mods...\n`)
let hasFailure = false

for (const mod of mods) {
  const modPath = join(modsDir, mod)
  console.log(`--- Validating [${mod}] ---`)
  const result = spawnSync('claude', ['plugin', 'validate', modPath], {
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) {
    hasFailure = true
    console.error(`FAILED: ${mod} validation returned exit code ${result.status}`)
  }
}

if (hasFailure) {
  console.error('\nSome mod validations failed.')
  process.exit(1)
} else {
  console.log('\nAll mod manifests and hooks validated successfully!')
  process.exit(0)
}
