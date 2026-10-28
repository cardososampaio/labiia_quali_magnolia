/**
 * IPC for the lexical analyses: R status, the Rscript path chosen in
 * Preferences, package checks and installs, running a test and saving its files.
 */
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { resolveR, writeConfiguredRPath, type RStatus } from './r-runtime'
import { checkPackages, installPackages, cancelInstall, type InstallResult } from './r-packages'
import { runLexicalTest, cancelLexicalRun } from './engine'
import { writeFile } from 'fs/promises'
import type { LexicalRunRequest, LexicalRunResult } from '../../renderer/models/lexical-api'

let installing = false

export function registerLexicalIpc(): void {
  ipcMain.handle('lexical:r-status', (_e, refresh?: boolean): Promise<RStatus> => resolveR(refresh === true))

  ipcMain.handle('lexical:r-set-path', (_e, path: string): Promise<RStatus> => {
    writeConfiguredRPath(typeof path === 'string' ? path.trim() : '')
    return resolveR(true)
  })

  ipcMain.handle('lexical:r-pick-path', async (e): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const opts: Electron.OpenDialogOptions = {
      title: 'Rscript',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Rscript', extensions: ['exe'] }] : []
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  ipcMain.handle('lexical:r-check-packages', async (_e, packages: string[]): Promise<{ status?: Record<string, boolean>; error?: string }> => {
    const r = await resolveR()
    if (!r.found || !r.installation) return { error: 'r-not-found' }
    try {
      return { status: await checkPackages(r.installation, Array.isArray(packages) ? packages : []) }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.handle('lexical:r-install-packages', async (e, packages: string[]): Promise<InstallResult | { error: string }> => {
    const r = await resolveR()
    if (!r.found || !r.installation) return { error: 'r-not-found' }
    if (installing) return { error: 'busy' }
    installing = true
    try {
      return await installPackages(r.installation, Array.isArray(packages) ? packages : [], (p) => {
        if (!e.sender.isDestroyed()) e.sender.send('lexical:r-install-progress', p)
      })
    } finally {
      installing = false
    }
  })

  ipcMain.handle('lexical:r-cancel-install', (): boolean => cancelInstall())

  ipcMain.handle('lexical:run', (e, req: LexicalRunRequest): Promise<LexicalRunResult> =>
    runLexicalTest(req, (p) => { if (!e.sender.isDestroyed()) e.sender.send('lexical:run-progress', p) }))

  ipcMain.handle('lexical:cancel-run', (_e, runId: string): void => cancelLexicalRun(runId))

  ipcMain.handle('lexical:save-file', async (e, file: { name: string; mime: string; data: string }): Promise<boolean> => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1) : ''
    const opts: Electron.SaveDialogOptions = { defaultPath: file.name, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return false
    await writeFile(res.filePath, Buffer.from(file.data, 'base64'))
    return true
  })
}
