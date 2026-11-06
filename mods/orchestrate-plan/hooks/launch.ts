import type { WorkItem } from '../types'

export const LAUNCH_COOLDOWN_MS = 2 * 60_000

const ON_LAUNCH = 'al lanzar cambia su Estado a `en curso — sesión <título> (<id de sesión local_…>)` en el plan.'

type Titled = Pick<WorkItem, 'id' | 'title'>

// The session title is `<id> · <nombre>`: the id is how the pane matches sessions to items,
// the name is what a human reads in the sidebar.
export const sessionTitle = (item: Titled) => (item.title ? `${item.id} · ${item.title}` : item.id)

// The turn the orchestrator receives: the model launches with its own tools and permissions.
export const launchInstruction = (item: Titled, planPath: string, heading: string) =>
  `Lanza una sesión ejecutora para ${item.id} con el prompt de su bloque en ${planPath} (encabezado: ${heading}). ` +
  `Usa start_session con ese prompt tal cual y el título "${sessionTitle(item)}", y ${ON_LAUNCH}`

export const launchBatchInstruction = (targets: readonly { item: Titled; heading: string }[], planPath: string) =>
  `Lanza una sesión ejecutora para cada uno de ${targets.map(t => t.item.id).join(', ')} con el prompt de su bloque en ${planPath} ` +
  `(encabezados: ${targets.map(t => t.heading).join(' | ')}). ` +
  `Usa start_session por cada uno con su prompt tal cual y estos títulos: ${targets.map(t => `"${sessionTitle(t.item)}"`).join(', ')}, y en cada uno ${ON_LAUNCH}`

export const syncInstruction = (id: string, planPath: string, reason: string) =>
  `Sincroniza la fila ${id} de ${planPath}: ${reason}. Verifica contra la fuente y actualiza su Estado.`

// A launch already asked for stays locked until the cooldown passes; once the plan shows the
// item en curso it leaves the listo group, so the button is gone anyway.
export const canLaunch = (launchedAt: number | undefined, now: number) =>
  launchedAt === undefined || now - launchedAt >= LAUNCH_COOLDOWN_MS

export const launchable = (
  items: readonly WorkItem[],
  prompts: Readonly<Record<string, string>>,
  launchedAt: Readonly<Record<string, number>>,
  now: number,
) => items.filter(i => i.status === 'listo' && prompts[i.id] !== undefined && canLaunch(launchedAt[i.id], now))
