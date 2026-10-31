import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const modsDir = join(process.cwd(), 'mods')
const mods = readdirSync(modsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

console.log(`Running test suites for ${mods.length} Claude Code mods...\n`)
let hasFailure = false

for (const mod of mods) {
  const modPath = join(modsDir, mod)
  console.log(`--- Testing [${mod}] ---`)
  const result = spawnSync('claude', ['plugin', 'test', modPath], {
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) {
    hasFailure = true
    console.error(`FAILED: ${mod} returned exit code ${result.status}`)
  }
}

if (hasFailure) {
  console.error('\nSome mod test suites failed.')
  process.exit(1)
} else {
  console.log('\nAll mod test suites passed successfully!')
  process.exit(0)
}
