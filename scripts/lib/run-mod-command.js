import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

/**
 * Discover mod directories in `mods/` and run a `claude plugin <subcommand>`
 * across all of them or a filtered subset passed via CLI arguments.
 */
export function runModCommand({
  subcommand,
  bannerPrefix,
  stepPrefix,
  successMessage,
  failureMessage,
  filter = process.argv.slice(2),
}) {
  const modsDir = join(process.cwd(), 'mods')
  const availableMods = readdirSync(modsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  const unknown = filter.filter(name => !availableMods.includes(name))
  if (unknown.length > 0) {
    console.error(`Unknown mod(s): ${unknown.join(', ')}`)
    console.error(`Available mods: ${availableMods.join(', ')}`)
    process.exit(1)
  }

  const mods = filter.length > 0
    ? availableMods.filter(name => filter.includes(name))
    : availableMods

  console.log(`${bannerPrefix} ${mods.length} Claude Code mod(s)...\n`)
  let hasFailure = false

  for (const mod of mods) {
    const modPath = join(modsDir, mod)
    console.log(`--- ${stepPrefix} [${mod}] ---`)
    const result = spawnSync('claude', ['plugin', subcommand, modPath], {
      stdio: 'inherit',
      shell: true,
    })
    if (result.status !== 0) {
      hasFailure = true
      console.error(`FAILED: ${mod} returned exit code ${result.status}`)
    }
  }

  if (hasFailure) {
    console.error(`\n${failureMessage}`)
    process.exit(1)
  }

  console.log(`\n${successMessage}`)
  process.exit(0)
}
