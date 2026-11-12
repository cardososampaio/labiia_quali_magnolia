/**
 * What the app knows about R: where it is, which packages are present, and
 * an install in progress. Shared by the lexical tabs and Preferences so a
 * package installed in one place shows as installed everywhere.
 */
import { create } from 'zustand'
import type { RInstallProgress, RInstallResult, RStatusInfo } from '../../models/lexical-api'

interface LexicalRState {
  status: RStatusInfo | null
  checking: boolean
  packages: Record<string, boolean>
  install: { running: boolean; progress?: RInstallProgress; lastLine?: string; result?: RInstallResult; error?: string }
  refresh: (force?: boolean) => Promise<RStatusInfo>
  setPath: (path: string) => Promise<void>
  checkPackages: (packages: string[]) => Promise<void>
  installPackages: (packages: string[]) => Promise<void>
  cancelInstall: () => void
}

let statusRequest: Promise<RStatusInfo> | null = null

export const useLexicalRStore = create<LexicalRState>((set, get) => ({
  status: null,
  checking: false,
  packages: {},
  install: { running: false },

  refresh: async (force = false) => {
    if (statusRequest && !force) return statusRequest
    set({ checking: true })
    statusRequest = window.api.lexical.rStatus(force).then((status) => {
      set({ status, checking: false, ...(force ? { packages: {} } : {}) })
      return status
    }, (err) => {
      const status: RStatusInfo = { found: false, configuredPath: '', problem: String(err) }
      set({ status, checking: false })
      return status
    })
    return statusRequest
  },

  setPath: async (path) => {
    set({ checking: true })
    let status: RStatusInfo
    try {
      status = await window.api.lexical.setRPath(path)
    } catch (err) {
      status = { found: false, configuredPath: path, problem: String(err) }
    }
    statusRequest = Promise.resolve(status)
    set({ status, checking: false, packages: {} })
  },

  checkPackages: async (packages) => {
    const status = get().status ?? await get().refresh()
    if (!status.found) return
    const res = await window.api.lexical.checkPackages(packages).catch((err) => ({ status: undefined, error: String(err) }))
    if (res.status) set((s) => ({ packages: { ...s.packages, ...res.status } }))
  },

  installPackages: async (packages) => {
    if (get().install.running) return
    set({ install: { running: true } })
    const off = window.api.lexical.onInstallProgress((p) => {
      set((s) => ({ install: { ...s.install, progress: p, lastLine: p.line ?? s.install.lastLine } }))
    })
    try {
      const res = await window.api.lexical.installPackages(packages)
      if ('error' in res) set({ install: { running: false, error: res.error } })
      else set({ install: { running: false, result: res } })
    } catch (err) {
      // The helper failed: the panel shows why instead of waiting forever.
      set({ install: { running: false, error: String(err) } })
    } finally {
      off()
      await get().checkPackages(packages)
    }
  },

  cancelInstall: () => { void window.api.lexical.cancelInstall() }
}))
