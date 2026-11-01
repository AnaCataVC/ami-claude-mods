import { readdirSync, cpSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const printEnv = args.includes('--print-env')
const isWindows = process.platform === 'win32'

const modsDir = join(process.cwd(), 'mods')
const mods = readdirSync(modsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

if (printEnv) {
  const separator = isWindows ? ';' : ':'
  const fullPaths = mods.map(m => join(modsDir, m)).join(separator)
  if (isWindows) {
    console.log(`PowerShell:\n$env:CLAUDE_CODE_PLUGIN_DIRS = "${fullPaths}"\n`)
    console.log(`Command Prompt:\nset CLAUDE_CODE_PLUGIN_DIRS=${fullPaths}\n`)
  } else {
    console.log(`Bash/Zsh:\nexport CLAUDE_CODE_PLUGIN_DIRS="${fullPaths}"\n`)
  }
  process.exit(0)
}

const targetBase = join(homedir(), '.claude', 'mods')
console.log(`Installing ${mods.length} Claude Code mods to: ${targetBase}\n`)

if (!existsSync(targetBase)) {
  mkdirSync(targetBase, { recursive: true })
}

for (const mod of mods) {
  const source = join(modsDir, mod)
  const destination = join(targetBase, mod)
  console.log(`- Copying [${mod}] -> ${destination}`)
  cpSync(source, destination, { recursive: true, force: true })
}

console.log(`\nSuccessfully installed all ${mods.length} mods to ${targetBase}`)
console.log(`You can now start Claude Code and verify with /hooks-panel`)
