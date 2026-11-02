import { expect, test } from 'claude-code/testing'
import {
  buildSections,
  emptyTracked,
  parseGitStatus,
  runningTracked,
  scratchpadDir,
  summarize,
  trackCommand,
  lingeringItems,
  shellWriteTargets,
  trackBackground,
  trackFile,
  trackResource,
} from './checklist'

const cwd = 'C:\\proj'

test('docker run -d with --name is tracked by name; --rm foreground is not', () => {
  const t = trackCommand(emptyTracked(), 'docker run -d --name "pg test" -p 5432:5432 postgres:16', cwd)
  expect(t.containers).toEqual([{ name: 'pg test', image: 'postgres:16' }])
  expect(trackCommand(emptyTracked(), 'docker run --rm alpine ls', cwd).containers).toEqual([])
})

test('docker run --rm -d is tracked: detached outlives the command', () => {
  const t = trackCommand(emptyTracked(), 'docker run --rm -d --name web nginx', cwd)
  expect(t.containers).toEqual([{ name: 'web', image: 'nginx' }])
})

test('the image is found past flags that take a value', () => {
  const command = 'docker run -d --restart always --entrypoint sh -u root -l a=b --mount type=bind,src=a,dst=b --env-file .env -m 1g -h box redis'
  expect(trackCommand(emptyTracked(), command, cwd).containers).toEqual([{ name: undefined, image: 'redis' }])
})

test('compose up keeps -f, -p and the directory it ran from', () => {
  const t = trackCommand(emptyTracked(), 'cd C:/stack && docker compose -f a.yml -f b.yml -p demo up -d', cwd)
  expect(t.composes).toEqual([{ legacy: false, files: ['a.yml', 'b.yml'], project: 'demo', dir: 'C:/stack' }])
  expect(trackCommand(emptyTracked(), 'docker-compose ps', cwd).composes).toEqual([])
})

test('legacy docker-compose up is tracked as legacy', () => {
  const t = trackCommand(emptyTracked(), 'docker-compose -p old up -d', cwd)
  expect(t.composes).toEqual([{ legacy: true, files: [], project: 'old', dir: cwd }])
})

test('volume create is tracked and repeated commands do not duplicate', () => {
  let t = trackCommand(emptyTracked(), 'docker volume create pgdata', cwd)
  t = trackCommand(t, 'docker volume create pgdata', cwd)
  expect(t.volumes).toEqual(['pgdata'])
})

test('files inside the project or ignored roots are not recorded', () => {
  const ignored = ['C:\\Temp\\claude']
  expect(trackFile(emptyTracked(), 'C:\\proj\\src\\a.ts', cwd, ignored).files).toEqual([])
  expect(trackFile(emptyTracked(), 'C:\\Temp\\claude\\x\\s.txt', cwd, ignored).files).toEqual([])
  expect(trackFile(emptyTracked(), 'C:\\other\\a.ts', cwd, ignored).files).toEqual(['C:/other/a.ts'])
})

test('docker ps rows match tracked containers by name, or by image when unnamed', () => {
  const ps = 'pg\tpostgres:16\nweb\tnginx\nstranger\tredis'
  expect(runningTracked(ps, [{ name: 'pg' }, { image: 'nginx' }])).toEqual(['pg', 'web'])
})

test('git status header gives branch, unpublished commits and the changed paths', () => {
  expect(parseGitStatus('## main...origin/main [ahead 2]\n M a\n?? b\n')).toEqual({ branch: 'main', changes: 2, unpushed: 2 })
  expect(parseGitStatus('## feat/x...origin/feat/x [ahead 3, behind 1]\n')).toEqual({ branch: 'feat/x', changes: 0, unpushed: 3 })
  expect(parseGitStatus('## main...origin/main [behind 4]\n')).toEqual({ branch: 'main', changes: 0, unpushed: 0 })
  expect(parseGitStatus('## main...origin/main\n')).toEqual({ branch: 'main', changes: 0, unpushed: 0 })
})

test('git status without a usable upstream reports unpushed as null', () => {
  expect(parseGitStatus('## local\n M a\n').unpushed).toBeNull()
  expect(parseGitStatus('## main...origin/main [gone]\n').unpushed).toBeNull()
  expect(parseGitStatus('## No commits yet on main\n?? a\n')).toEqual({ branch: 'main', changes: 1, unpushed: null })
  expect(parseGitStatus('## HEAD (no branch)\n').branch).toBe('detached HEAD')
})

test('scratchpad path generation', () => {
  expect(scratchpadDir('C:\\T', 'C:\\workspace\\proj', 'sid')).toBe('C:/T/claude/C--workspace-proj/sid/scratchpad')
})

const base = { git: null, docker: null, scratchFiles: null, files: [] }

test('git changes and unpushed commits warn when present', () => {
  const git = { branch: 'main', changes: 3, unpushed: 2 }
  const sections = buildSections({ ...base, git })
  expect(sections[0]!.title).toBe('Estado de Git')
  expect(sections[0]!.items.filter(i => !i.ok).length).toBe(2)
})

test('docker down reads as not running, leftovers warn, sections without data are skipped', () => {
  const down = buildSections({ ...base, docker: { status: 'down' } })
  expect(down.map(s => s.title)).toEqual(['Docker', 'Archivos creados fuera del proyecto'])
  expect(down[0]!.items[0]).toEqual({ ok: true, text: 'Docker no está corriendo' })
  const up = buildSections({ ...base, docker: { status: 'up', containers: ['pg'], composes: [], volumes: ['v'], unverified: [] } })
  expect(up[0]!.items.every(i => !i.ok)).toBe(true)
})

test('summarize formats single and plural pending count', () => {
  const clean = buildSections({ ...base, files: [] })
  expect(summarize(clean)).toBeUndefined()
  const dirty = buildSections({ ...base, files: ['C:/outside.txt'] })
  expect(summarize(dirty)).toBe('Antes de cerrar: 1 ítem pendiente, revisa /cierre')
})
