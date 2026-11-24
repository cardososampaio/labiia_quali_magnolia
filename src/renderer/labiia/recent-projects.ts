/**
 * How a recent project is shown on the welcome screen: the project's name
 * stands out (the file name without .qdpx, the same name the window title
 * shows), with the folder it is in underneath, so projects are told apart
 * at a glance. Paths can use \ (Windows) or / (Mac).
 */
export interface RecentProjectLabel {
  name: string
  folder: string
}

export function recentProjectLabel(path: string, savedName?: string): RecentProjectLabel {
  const cut = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  const file = cut >= 0 ? path.slice(cut + 1) : path
  const folder = cut > 0 ? path.slice(0, cut) : ''
  const name = file.replace(/\.qdpx$/i, '').trim() || (savedName ?? '').trim() || path
  return { name, folder }
}
