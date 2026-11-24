/**
 * Whether the Características (tags) panel is shown under the Documents
 * panel. It can be closed by its own X button and reopened from the View
 * tab, like the other panels. It is a viewing choice of the person at this
 * computer, not part of the project, so it stays in local storage and every
 * project opens the same way.
 *
 * The panel lives inside the Documents column: it shows only while the
 * Documents panel is open, so showing it from the View tab also reopens
 * Documents.
 */
import { create } from 'zustand'

const STORAGE_KEY = 'labiia.tagsPanelVisible'

/** Shown unless it was closed before: a new installation shows the panel. */
export function parseTagsPanelVisible(raw: string | null): boolean {
  return raw !== '0'
}

function readSaved(): boolean {
  try { return parseTagsPanelVisible(localStorage.getItem(STORAGE_KEY)) } catch { return true }
}

interface TagsPanelState {
  visible: boolean
  setVisible: (visible: boolean) => void
}

export const useTagsPanel = create<TagsPanelState>((set) => ({
  visible: readSaved(),
  setVisible: (visible) => {
    set({ visible })
    try { localStorage.setItem(STORAGE_KEY, visible ? '1' : '0') } catch { /* viewing convenience only */ }
  }
}))

/** The panel is on screen only with the Documents panel open. */
export function tagsPanelShown(visible: boolean, documentsVisible: boolean): boolean {
  return visible && documentsVisible
}

/** The View tab's button: hides the panel when it is on screen; otherwise
 *  shows it, reopening the Documents panel that holds it. */
export function toggleTagsPanelFromView(documentsVisible: boolean, openDocuments: () => void): void {
  const { visible, setVisible } = useTagsPanel.getState()
  if (tagsPanelShown(visible, documentsVisible)) {
    setVisible(false)
    return
  }
  setVisible(true)
  if (!documentsVisible) openDocuments()
}

// The Documents panel can be popped out into its own window: closing the
// panel in one window closes it in the other.
try {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) useTagsPanel.setState({ visible: parseTagsPanelVisible(e.newValue) })
  })
} catch { /* no window (tests) */ }
