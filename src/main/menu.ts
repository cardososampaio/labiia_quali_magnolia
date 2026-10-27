import { app, Menu, BrowserWindow } from 'electron'
import { checkForUpdatesManually } from './auto-updater'
import { openBundledLicenceFile } from './licence-files'
import { showOpenDialog } from './dialogs'
import { t } from '../renderer/i18n'

export interface WindowListEntry {
  label: string
  window: BrowserWindow
}

export function buildMenu(mainWindow: BrowserWindow, openWindows?: WindowListEntry[], panelVisibility?: Record<string, boolean>): void {
  const isMac = process.platform === 'darwin'

  function sendAction(action: string): void {
    mainWindow.webContents.send('menu-action', action)
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              // Explicit label so the menu shows "About Magnolia" even
              // in dev where app.name comes from package.json's lowercase
              // "magnolia". The role still wires up the native About panel.
              { label: t("About labiia_quali"), role: 'about' as const },
              {
                label: t("Check for Updates…"),
                click: () => checkForUpdatesManually()
              },
              {
                label: t("Acknowledgements"),
                click: () => openBundledLicenceFile('THIRD-PARTY-LICENSES.txt')
              },
              { type: 'separator' as const },
              {
                label: t("Preferences..."),
                accelerator: 'Cmd+,',
                click: () => {
                  const { BrowserWindow } = require('electron')
                  const focusedWindow = BrowserWindow.getFocusedWindow()
                  if (focusedWindow) focusedWindow.webContents.send('menu-action', 'open-preferences')
                }
              },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              // Explicit label so it reads "Quit Magnolia" rather than the
              // lowercase package name app.name resolves to in dev.
              { role: 'quit' as const, label: t("Quit labiia_quali") }
            ]
          }
        ]
      : []),
    {
      label: t("File"),
      submenu: [
        {
          label: t("New Project"),
          click: () => sendAction('new-project')
        },
        {
          label: t("Open Project..."),
          accelerator: 'CmdOrCtrl+O',
          // Show the native picker directly from the menu click instead
          // of routing the action through the renderer and back. Saves
          // one full IPC round-trip — the picker now appears as soon as
          // macOS dispatches the click. After the user picks, we deliver
          // the path to the renderer via the existing 'open-recent-
          // project' channel, which already does the full load + state
          // reset.
          click: async () => {
            const result = await showOpenDialog(mainWindow, {
              title: t("Open QDPX Project"),
              filters: [{ name: t('QDPX Projects'), extensions: ['qdpx'] }],
              properties: ['openFile']
            })
            if (result.canceled || result.filePaths.length === 0) return
            mainWindow.webContents.send('open-recent-project', result.filePaths[0])
          }
        },
        {
          label: t("Save Project"),
          accelerator: 'CmdOrCtrl+S',
          click: () => sendAction('save-project')
        },
        {
          label: t("Save Project As..."),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendAction('save-project-as')
        },
        { type: 'separator' },
        {
          label: t("Project Details..."),
          click: () => sendAction('open-project-details')
        },
        { type: 'separator' },
        {
          label: t("Import Document..."),
          accelerator: 'CmdOrCtrl+I',
          click: () => sendAction('import-document')
        },
        { type: 'separator' },
        isMac
          ? {
              // Cmd+W closes the focused popped-out window (matching the
              // macOS default), but in the main window it closes the
              // currently active tab in the document viewer instead —
              // Magnolia's main window is the only one that owns tabs,
              // and closing it via Cmd+W would be more destructive than
              // useful when the user just wants to dismiss a tab.
              label: t("Close Tab"),
              accelerator: 'Cmd+W',
              click: () => {
                const focused = BrowserWindow.getFocusedWindow()
                if (focused && focused !== mainWindow) {
                  focused.close()
                } else {
                  sendAction('close-active-tab')
                }
              }
            }
          : { role: 'quit', label: t("Quit labiia_quali") }
      ]
    },
    {
      label: t("Edit"),
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: t("Codes"),
      submenu: [
        {
          label: t("New Code"),
          accelerator: 'CmdOrCtrl+N',
          click: () => sendAction('new-code')
        },
        { type: 'separator' },
        {
          label: t("Codebook"),
          click: () => sendAction('show-codebook')
        },
        { type: 'separator' },
        {
          label: t("Import Codebook (.qdc)..."),
          click: () => sendAction('import-codebook')
        },
        {
          label: t("Export Codebook (.qdc)..."),
          click: () => sendAction('export-codebook')
        }
      ]
    },
    {
      label: t("Documents"),
      submenu: [
        {
          label: t("Import Document..."),
          accelerator: 'CmdOrCtrl+I',
          click: () => sendAction('import-document')
        },
        { type: 'separator' },
        {
          label: t("New Folder"),
          click: () => sendAction('new-doc-folder')
        },
        { type: 'separator' },
        {
          label: t("Manage Document Tags..."),
          click: () => sendAction('manage-doc-tags')
        }
      ]
    },
    {
      label: t("View"),
      submenu: [
        {
          label: t("Documents"),
          type: 'checkbox',
          checked: panelVisibility?.documents !== false,
          click: () => sendAction('toggle-panel-documents')
        },
        {
          label: t("Codes"),
          type: 'checkbox',
          checked: panelVisibility?.codes !== false,
          click: () => sendAction('toggle-panel-codes')
        },
        {
          label: t("Queries"),
          type: 'checkbox',
          checked: panelVisibility?.queries !== false,
          click: () => sendAction('toggle-panel-queries')
        },
        {
          label: t("Memos"),
          type: 'checkbox',
          checked: panelVisibility?.memos !== false,
          click: () => sendAction('toggle-panel-memos')
        },
        {
          label: t("Quotes"),
          type: 'checkbox',
          checked: panelVisibility?.quotes !== false,
          click: () => sendAction('toggle-panel-quotes')
        },
        {
          label: t("Analyses"),
          type: 'checkbox',
          checked: panelVisibility?.analyses !== false,
          click: () => sendAction('toggle-panel-analyses')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(openWindows && openWindows.length > 0
          ? [
              { type: 'separator' as const },
              ...openWindows.map((entry) => ({
                label: entry.label,
                click: () => {
                  if (!entry.window.isDestroyed()) {
                    entry.window.show()
                    entry.window.focus()
                  }
                }
              }))
            ]
          : [])
      ]
    },
    // Help menu — present on every platform. macOS already has the
    // About + Check-for-Updates entries in the app menu, but the
    // Help menu repeats them so Windows / Linux users (no app menu)
    // can find them.
    {
      role: 'help' as const,
      submenu: [
        {
          label: t("Magnolia (original project) on GitHub"),
          click: async () => {
            const { shell } = require('electron')
            await shell.openExternal('https://github.com/caledavis/Magnolia')
          }
        },
        {
          label: t("Support Magnolia (original project)…"),
          click: async () => {
            const { shell } = require('electron')
            await shell.openExternal('https://github.com/sponsors/caledavis')
          }
        },
        ...(isMac ? [] : [
          { type: 'separator' as const },
          {
            label: t("Check for Updates…"),
            click: () => checkForUpdatesManually()
          },
          { label: t("About labiia_quali"), role: 'about' as const }
        ])
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
