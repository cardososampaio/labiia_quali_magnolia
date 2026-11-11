/**
 * Stands in for the `electron` module inside the helper, so the lexical
 * engine (written for Electron's main process) runs unchanged under Node.
 * Only what the engine uses is here: `app.getPath`, `app.isPackaged` and
 * `app.getAppPath`. The helper bundle and its tests alias `electron` to this
 * file.
 */
import { dirname } from 'path'
import { paths } from './paths'

export const app = {
  isPackaged: true,
  getAppPath(): string {
    return dirname(paths.resourcesDir)
  },
  getPath(name: string): string {
    if (name === 'userData') return paths.dataDir
    if (name === 'temp') return paths.tempDir
    throw new Error(`electron-shim: getPath('${name}') is not available in the helper`)
  }
}
