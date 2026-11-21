import { spawnSync } from 'node:child_process'
import { chmodSync } from 'node:fs'
import { join } from 'node:path'

const hookNames = ['pre-push', 'post-merge']

console.log('Configuring local git hooks directory to .githooks...')
const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  stdio: 'inherit',
})

if (result.status !== 0) {
  console.error('Failed to configure git core.hooksPath')
  process.exit(1)
}

if (process.platform !== 'win32') {
  for (const hook of hookNames) {
    const hookPath = join(process.cwd(), '.githooks', hook)
    try {
      chmodSync(hookPath, 0o755)
    } catch (err) {
      console.warn(`Could not set executable permission on .githooks/${hook}:`, err.message)
    }
  }
}

console.log(`Successfully activated git hooks (${hookNames.map(h => `.githooks/${h}`).join(', ')})!`)
